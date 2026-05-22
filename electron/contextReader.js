// Reads "what is the user looking at right now?"
//
// macOS path
//   1. AppleScript via osascript to get the frontmost app name + its window
//      title. (System Events)
//   2. If the frontmost app is a browser, ALSO ask the browser directly for
//      the URL of its active tab. This is far more reliable than parsing the
//      window title (Safari often shows generic titles like "(15) Home" or
//      blanks them out entirely when you're typing in a web form).
//   3. Detect the website from the URL's hostname. Fall back to title-based
//      detection if URL retrieval fails (e.g. Firefox doesn't expose tab
//      URLs via AppleScript, or the user hasn't granted Automation
//      permission yet — see note below).
//
// Permissions on macOS
//   The browser URL query uses AppleScript "tell application <Browser>"
//   which triggers an Automation permission prompt the first time. The user
//   must click "Allow" once per browser. Until granted the URL comes back
//   empty and we fall back to title parsing.
//
// Windows path
//   PowerShell + GetForegroundWindow. No browser-URL introspection yet.

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { detectFieldAX } from './fieldDetector.js';

const pexec = promisify(exec);

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

// Known apps → inferred content type. Used to pre-select the right pill.
const APP_MAP = {
  Mail: 'email',
  Gmail: 'email',
  Outlook: 'email',
  Salesforce: 'crm-note',
  HubSpot: 'crm-note',
  Notion: 'document',
  LinkedIn: 'professional-bio',
  Facebook: 'post',
  Instagram: 'post',
  Twitter: 'post',
  TikTok: 'post',
  YouTube: 'post',
  Reddit: 'post',
  Chrome: 'general',
  Safari: 'general',
  Word: 'document',
  Airbnb: 'listing-description',
  Slack: 'message',
  Messages: 'message',
  WhatsApp: 'message',
  Discord: 'message',
};

// Browsers we know how to introspect (or want to flag as a browser shell).
// "AppleScript-supported" means we can ask them for the active tab URL.
const BROWSERS = new Set([
  'Safari', 'Safari Technology Preview',
  'Google Chrome', 'Google Chrome Canary', 'Chromium',
  'Arc',
  'Brave Browser',
  'Microsoft Edge',
  'Vivaldi',
  'Opera',
  'Firefox', // listed so we know it's a browser, but URL query won't work
]);

// Title-based fallback patterns. Used only if URL retrieval failed.
const WEB_APP_PATTERNS = [
  { name: 'Facebook',  match: /\bfacebook\b/i },
  { name: 'Instagram', match: /\binstagram\b/i },
  { name: 'LinkedIn',  match: /\blinkedin\b/i },
  { name: 'Twitter',   match: /\b(twitter|x\.com)\b/i },
  { name: 'TikTok',    match: /\btiktok\b/i },
  { name: 'YouTube',   match: /\byoutube\b/i },
  { name: 'Reddit',    match: /\breddit\b/i },
  { name: 'Gmail',     match: /\b(gmail|inbox)\b/i },
  { name: 'Outlook',   match: /\boutlook\b/i },
  { name: 'Notion',    match: /\bnotion\b/i },
  { name: 'Slack',     match: /\bslack\b/i },
  { name: 'Discord',   match: /\bdiscord\b/i },
  { name: 'WhatsApp',  match: /\bwhatsapp\b/i },
  { name: 'Salesforce',match: /\bsalesforce\b|\.force\.com/i },
  { name: 'HubSpot',   match: /\bhubspot\b/i },
  { name: 'Airbnb',    match: /\bairbnb\b/i },
];

// URL hostname → app name. Far more accurate than title parsing.
const URL_HOST_MAP = [
  { host: 'facebook.com',          name: 'Facebook' },
  { host: 'fb.com',                name: 'Facebook' },
  { host: 'messenger.com',         name: 'Messenger' },
  { host: 'instagram.com',         name: 'Instagram' },
  { host: 'linkedin.com',          name: 'LinkedIn' },
  { host: 'twitter.com',           name: 'Twitter' },
  { host: 'x.com',                 name: 'Twitter' },
  { host: 'tiktok.com',            name: 'TikTok' },
  { host: 'youtube.com',           name: 'YouTube' },
  { host: 'reddit.com',            name: 'Reddit' },
  { host: 'mail.google.com',       name: 'Gmail' },
  { host: 'outlook.live.com',      name: 'Outlook' },
  { host: 'outlook.office.com',    name: 'Outlook' },
  { host: 'outlook.office365.com', name: 'Outlook' },
  { host: 'notion.so',             name: 'Notion' },
  { host: 'notion.site',           name: 'Notion' },
  { host: 'app.slack.com',         name: 'Slack' },
  { host: 'slack.com',             name: 'Slack' },
  { host: 'discord.com',           name: 'Discord' },
  { host: 'web.whatsapp.com',      name: 'WhatsApp' },
  { host: 'salesforce.com',        name: 'Salesforce' },
  { host: 'force.com',             name: 'Salesforce' },
  { host: 'hubspot.com',           name: 'HubSpot' },
  { host: 'airbnb.com',            name: 'Airbnb' },
  { host: 'github.com',            name: 'GitHub' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Detection helpers
// ─────────────────────────────────────────────────────────────────────────────

function detectWebAppFromTitle(title) {
  if (!title) return null;
  for (const { name, match } of WEB_APP_PATTERNS) {
    if (match.test(title)) return name;
  }
  return null;
}

function detectWebAppFromUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    for (const { host: needle, name } of URL_HOST_MAP) {
      if (host === needle || host.endsWith('.' + needle)) return name;
    }
  } catch {
    // Bad URL — ignore.
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// macOS — front app + window title + (if browser) active tab URL
// ─────────────────────────────────────────────────────────────────────────────

// PHASE 1 SCRIPT — fetches frontmost app name + its window title.
// No browser-specific `tell application` statements here, so this script
// compiles successfully no matter what browsers are installed.
const PHASE1_SCRIPT = `
tell application "System Events"
  set frontApp to ""
  set winTitle to ""
  try
    set frontApp to name of first application process whose frontmost is true
  end try
  try
    set winTitle to name of front window of (first application process whose frontmost is true)
  end try
  return frontApp & "||" & winTitle
end tell
`;

// PHASE 2 SCRIPTS — one per browser. Only the matching one is invoked.
// AppleScript compiles `tell application "X"` at parse time and FAILS if X
// isn't installed on the system. So we pick the right one based on Phase 1's
// frontApp result and execute only that.
const BROWSER_URL_SCRIPTS = {
  'Safari':                    'tell application "Safari" to return URL of current tab of front window',
  'Safari Technology Preview': 'tell application "Safari Technology Preview" to return URL of current tab of front window',
  'Google Chrome':             'tell application "Google Chrome" to return URL of active tab of front window',
  'Google Chrome Canary':      'tell application "Google Chrome Canary" to return URL of active tab of front window',
  'Chromium':                  'tell application "Chromium" to return URL of active tab of front window',
  'Arc':                       'tell application "Arc" to return URL of active tab of front window',
  'Brave Browser':             'tell application "Brave Browser" to return URL of active tab of front window',
  'Microsoft Edge':            'tell application "Microsoft Edge" to return URL of active tab of front window',
  'Vivaldi':                   'tell application "Vivaldi" to return URL of active tab of front window',
  'Opera':                     'tell application "Opera" to return URL of active tab of front window',
};

async function osa(script, timeoutMs = 2500) {
  const { stdout } = await pexec(
    `osascript -e '${script.replace(/'/g, "'\\''")}'`,
    { timeout: timeoutMs },
  );
  return stdout.trim();
}

async function readMac() {
  // Phase 1 — always works, no browser dependency.
  let phase1Out = '';
  try {
    phase1Out = await osa(PHASE1_SCRIPT, 2000);
  } catch (err) {
    console.warn('[FlowWrite] phase-1 AppleScript failed:', err.message);
    return { activeApp: 'Unknown', windowTitle: '', url: '' };
  }
  const [app, title] = phase1Out.split('||');
  const activeApp = app || 'Unknown';
  const windowTitle = title || '';

  // Phase 2 — only if it's a browser we know how to query.
  let url = '';
  const urlScript = BROWSER_URL_SCRIPTS[activeApp];
  if (urlScript) {
    try {
      url = await osa(urlScript, 1500);
    } catch (err) {
      // Common reasons:
      //   • User hasn't granted Automation permission yet → empty + warning
      //   • Browser has no open window → empty
      //   • The browser is not in fact installed (shouldn't happen since we
      //     matched the front app, but defensive)
      console.warn('[FlowWrite] phase-2 (browser URL) failed:', err.message);
    }
  }

  return { activeApp, windowTitle, url };
}

async function readWindows() {
  // PowerShell one-liner that returns "ProcessName||WindowTitle".
  const ps = `
    Add-Type @"
      using System;
      using System.Runtime.InteropServices;
      using System.Text;
      public class Win {
        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
        [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int p);
      }
"@
    $h = [Win]::GetForegroundWindow()
    $sb = New-Object System.Text.StringBuilder 512
    [Win]::GetWindowText($h, $sb, 512) | Out-Null
    $pid = 0
    [Win]::GetWindowThreadProcessId($h, [ref]$pid) | Out-Null
    $p = Get-Process -Id $pid
    "$($p.ProcessName)||$($sb.ToString())||$($h.ToInt64())"
  `;
  const { stdout } = await pexec(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`);
  // The third field is the foreground window handle (HWND). We keep it so the
  // auto-fill step can restore focus to *this* window before pasting — after the
  // popup hides, Windows won't reliably hand focus back on its own.
  const [app, title, hwnd] = stdout.trim().split('||');
  return { activeApp: app || 'Unknown', windowTitle: title || '', url: '', hwnd: hwnd || '' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {{x:number,y:number}} mousePosition
 * @returns {Promise<object>} fieldContext
 */
export async function readContext(mousePosition) {
  // Run app-info read + AX field detection in parallel.
  const [info, axField] = await Promise.all([
    (async () => {
      try {
        return process.platform === 'darwin' ? await readMac() : await readWindows();
      } catch (err) {
        console.warn('[FlowWrite] readContext app-info failed:', err.message);
        return { activeApp: 'Unknown', windowTitle: '', url: '' };
      }
    })(),
    (async () => {
      try {
        return await detectFieldAX(mousePosition);
      } catch (err) {
        console.warn('[FlowWrite] detectFieldAX failed:', err.message);
        return null;
      }
    })(),
  ]);

  // If AX says no text field is under the cursor, suppress the popup unless
  // AX is unavailable on this platform (Windows / ffi disabled).
  const isTextField = axField ? axField.isTextField : true;

  // If the foreground app is a browser, try to resolve the real website.
  // Priority: URL (most reliable) → title (fallback) → no override.
  let browser = null;
  let resolvedApp = info.activeApp;
  if (BROWSERS.has(info.activeApp)) {
    browser = info.activeApp;
    const webByUrl = detectWebAppFromUrl(info.url);
    const webByTitle = !webByUrl ? detectWebAppFromTitle(info.windowTitle) : null;
    const web = webByUrl || webByTitle;
    if (web) resolvedApp = web;
  }

  // Visible diagnostic: shows in the terminal running `npm run dev` so the
  // user can see what was actually detected when something looks off.
  console.info('[FlowWrite] context →', {
    app:    resolvedApp,
    via:    browser ? (info.url ? 'url' : (info.windowTitle ? 'title' : 'browser-only')) : 'direct',
    rawApp: info.activeApp,
    title:  info.windowTitle || '(empty)',
    url:    info.url || '(none — Automation permission may be missing)',
  });

  const matchedKey =
    Object.keys(APP_MAP).find((k) =>
      resolvedApp.toLowerCase().includes(k.toLowerCase()),
    ) || null;

  // Refine fieldType: prefer the label from AX over the app-level guess.
  let fieldType = matchedKey ? APP_MAP[matchedKey] : 'general';
  if (axField?.fieldLabel) {
    const lbl = axField.fieldLabel.toLowerCase();
    if (lbl.includes('email') || lbl.includes('subject')) fieldType = 'email';
    else if (lbl.includes('bio') || lbl.includes('about')) fieldType = 'professional-bio';
    else if (lbl.includes('description') || lbl.includes('listing')) fieldType = 'listing-description';
    else if (lbl.includes('note') || lbl.includes('comment')) fieldType = 'crm-note';
    else if (lbl.includes('message') || lbl.includes('reply') || lbl.includes('post')) fieldType = 'message';
  }

  return {
    isTextField,
    fieldLabel: axField?.fieldLabel || '',
    fieldPlaceholder: axField?.fieldPlaceholder || '',
    surroundingText: axField?.existingValue || '',
    activeApp: resolvedApp,
    browser,                  // e.g. "Safari" — null unless we're inside a browser
    url: info.url || '',      // raw URL of the active tab, if we could read it
    windowTitle: info.windowTitle,
    fieldType,
    cursor: mousePosition,
    // Foreground window handle (Windows only) — used by autoFill to restore
    // focus to the right window before pasting. null/undefined elsewhere.
    hwnd: info.hwnd || null,
  };
}
