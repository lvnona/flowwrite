// Google OAuth code flow with PKCE for the desktop app.
//
// Why this, not signInWithPopup?
//   Electron BrowserWindow popups have intermittent issues with Google's
//   OAuth redirect handling. The cleanest reliable flow is:
//     1. Generate PKCE verifier + challenge.
//     2. Spin up a tiny HTTP server on a random loopback port.
//     3. Open the OS default browser to Google's auth URL with
//        redirect_uri=http://127.0.0.1:<port>/callback.
//     4. Google posts the auth code back to our local server.
//     5. Exchange the code (with our PKCE verifier) for an id_token.
//     6. Return the id_token to the renderer; renderer hands it to Firebase
//        via signInWithCredential.
//
// PKCE means we don't need a client secret — safe for a "public" client
// (Google's "Desktop app" OAuth client type).

import http from 'node:http';
import crypto from 'node:crypto';
import { shell } from 'electron';

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 min

// ─── PKCE helpers ──────────────────────────────────────────────────────────

function base64UrlEncode(buf) {
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function generateVerifier() {
  return base64UrlEncode(crypto.randomBytes(32));
}

function challengeFor(verifier) {
  return base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
}

// ─── Success / error pages shown in the user's browser ─────────────────────

const SUCCESS_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>FlowWrite — Signed in</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
        background: #1a1a2e; color: white;
      }
      .card {
        text-align: center; max-width: 380px; padding: 40px 32px;
        background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.10);
        border-radius: 16px; backdrop-filter: blur(20px);
      }
      h1 { margin: 0 0 8px; font-size: 22px; font-weight: 600; }
      p  { margin: 0; color: rgba(255,255,255,0.6); font-size: 14px; line-height: 1.5; }
      .icon { font-size: 36px; margin-bottom: 12px; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon">✨</div>
      <h1>Signed in to FlowWrite</h1>
      <p>You can close this tab and return to the app.</p>
    </div>
    <script>setTimeout(() => window.close(), 1500);</script>
  </body>
</html>`;

function errorHtml(message) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>FlowWrite — Sign-in failed</title>
    <style>
      body { font-family: -apple-system, system-ui, sans-serif; padding: 40px; text-align: center;
             background: #1a1a2e; color: white; }
      h1 { font-size: 20px; }
      pre { background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px;
            color: #ff8a8a; overflow-wrap: break-word; white-space: pre-wrap; max-width: 480px; margin: 12px auto; }
    </style>
  </head>
  <body>
    <h1>Sign-in failed</h1>
    <pre>${String(message).replace(/[<>&]/g, (c) => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</pre>
    <p>Return to FlowWrite to try again.</p>
  </body>
</html>`;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Run a full Google OAuth code-flow + PKCE round trip.
 * @param {string} clientId     — Google "Desktop app" OAuth client ID.
 * @param {string} clientSecret — Client secret (required by Google for Desktop apps).
 * @returns {Promise<{ idToken: string, accessToken: string }>}
 */
export function googleSignIn(clientId, clientSecret) {
  if (!clientId) {
    return Promise.reject(new Error('No Google OAuth client ID configured.'));
  }
  return new Promise((resolve, reject) => {
    const verifier = generateVerifier();
    const challenge = challengeFor(verifier);
    const state = base64UrlEncode(crypto.randomBytes(16));

    let timeoutHandle = null;
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url, `http://${req.headers.host}`);
        if (reqUrl.pathname !== '/callback') {
          res.writeHead(404);
          res.end();
          return;
        }

        // 1. Sanity-check the callback.
        const error = reqUrl.searchParams.get('error');
        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(errorHtml(error));
          cleanup();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }
        const code = reqUrl.searchParams.get('code');
        const returnedState = reqUrl.searchParams.get('state');
        if (!code || returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(errorHtml('Invalid OAuth callback (state mismatch).'));
          cleanup();
          reject(new Error('Invalid OAuth callback'));
          return;
        }

        // 2. Exchange the code for tokens.
        // Google requires client_secret for Desktop app clients even with PKCE.
        const port = server.address().port;
        const redirectUri = `http://127.0.0.1:${port}/callback`;
        const tokenParams = {
          code,
          client_id: clientId,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: verifier,
        };
        if (clientSecret) tokenParams.client_secret = clientSecret;
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(tokenParams),
        });
        const tokens = await tokenRes.json();

        if (tokens.error) {
          const msg = tokens.error_description || tokens.error;
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(errorHtml(msg));
          cleanup();
          reject(new Error(`Token exchange failed: ${msg}`));
          return;
        }

        // 3. Success.
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(SUCCESS_HTML);
        cleanup();
        resolve({
          idToken: tokens.id_token,
          accessToken: tokens.access_token,
        });
      } catch (err) {
        try {
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(errorHtml(err.message));
        } catch { /* ignore */ }
        cleanup();
        reject(err);
      }
    });

    function cleanup() {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      try { server.close(); } catch { /* ignore */ }
    }

    server.on('error', (err) => {
      cleanup();
      reject(err);
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      const authUrl =
        'https://accounts.google.com/o/oauth2/v2/auth?' +
        new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: 'openid profile email',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          state,
          // Always prompt the account chooser so users can switch accounts
          // even if they have an active Google session.
          prompt: 'select_account',
          // openid extras
          access_type: 'offline',
        }).toString();

      console.info(`[FlowWrite] OAuth: listening on ${redirectUri}, opening browser…`);
      shell.openExternal(authUrl);
    });

    timeoutHandle = setTimeout(() => {
      cleanup();
      reject(new Error('Sign-in timed out (5 min).'));
    }, OAUTH_TIMEOUT_MS);
  });
}
