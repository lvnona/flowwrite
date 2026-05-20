// Main Electron process.
// Boots two BrowserWindows (hidden main + floating popup), registers the global
// hotkey that summons the popup, registers the system tray, and exposes IPC
// channels that the renderer calls to talk to native subsystems.
//
// Trigger model: Whispr / Wispr Flow-style — the app sits silently in the
// background, and the popup ONLY appears when the user presses the global
// hotkey (default: Cmd/Ctrl + Shift + W). There is no hover-detection.
// (The startHoverWatcher / stopHoverWatcher helpers in fieldDetector.js are
// still imported so they remain available if someone wants to re-enable
// hover triggering later, but we never call them.)

import { app, BrowserWindow, ipcMain, globalShortcut, screen } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Store from 'electron-store';
import Anthropic from '@anthropic-ai/sdk';

import { createTray } from './tray.js';
import { createPopupWindow, showPopupAt, hidePopup } from './popup.js';
import { readContext } from './contextReader.js';
import { autoFillText } from './autoFill.js';
import { googleSignIn } from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

// Persistent settings/history. Keys we use are documented near getSettings/saveSettings.
const store = new Store({
  defaults: {
    settings: {
      anthropicApiKey: '',
      defaultTone: 'Professional',
      defaultLength: 'Medium',
      hotkey: 'CommandOrControl+Shift+W',
      niche: 'General',
      paused: false,
    },
    history: [],
    // User-defined example posts (few-shot style references). Each item:
    // { id, name, platform, content, notes?, createdAt, updatedAt }
    userTemplates: [],
  },
});

// Holds references so they are not garbage-collected.
let mainWindow = null;
let popupWindow = null;
let tray = null;

/**
 * The "main" window hosts the Settings and History pages. It is hidden by default
 * and only shown when the user picks an option from the tray menu.
 */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 640,
    show: false,
    title: 'FlowWrite',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Dev: load Vite server (use root URL — /index.html would be shadowed if a
  // file with that name existed in publicDir). Prod: load the built dist/.
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173/?route=settings');
  } else {
    mainWindow.loadFile(join(__dirname, '..', 'dist', 'index.html'), {
      query: { route: 'settings' },
    });
  }

  mainWindow.on('close', (e) => {
    // Hide instead of quitting — the app should keep running in the tray.
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

/**
 * Opens the hidden main window on a specific route ("settings" or "history").
 */
function openMainWindowOn(route) {
  if (!mainWindow) createMainWindow();
  if (isDev) {
    mainWindow.loadURL(`http://localhost:5173/?route=${route}`);
  } else {
    mainWindow.loadFile(join(__dirname, '..', 'dist', 'index.html'), {
      query: { route },
    });
  }
  mainWindow.show();
  mainWindow.focus();
}

/**
 * Summon the popup at the current cursor position. Called by the global
 * hotkey handler, the "show-popup" IPC channel, and the "apply-template"
 * IPC channel (which also attaches a templateId).
 */
async function summonPopup(position, { templateId = null } = {}) {
  const settings = store.get('settings');
  if (settings.paused) return;

  const fieldContext = await readContext(position);
  if (!fieldContext) return;

  if (templateId) fieldContext.pendingTemplate = templateId;

  // We intentionally do NOT gate on fieldContext.isTextField: in hotkey-only
  // mode the user explicitly asked for the popup, so always show it.
  showPopupAt(popupWindow, position, fieldContext);
}

app.whenReady().then(() => {
  createMainWindow();
  popupWindow = createPopupWindow();

  tray = createTray({
    onOpenDashboard: () => openMainWindowOn('dashboard'),
    onOpenSettings: () => openMainWindowOn('settings'),
    onOpenHistory: () => openMainWindowOn('history'),
    onSummon: () => summonPopup(screen.getCursorScreenPoint()),
    getHotkey: () => store.get('settings').hotkey || 'CommandOrControl+Shift+W',
    onTogglePause: () => {
      const settings = store.get('settings');
      settings.paused = !settings.paused;
      store.set('settings', settings);
      return settings.paused;
    },
    isPaused: () => store.get('settings').paused,
    onQuit: () => {
      app.isQuitting = true;
      app.quit();
    },
  });

  // The ONLY way to summon the popup is the global hotkey. The app sits
  // quietly in the tray until the user presses it.
  const hotkey = store.get('settings').hotkey || 'CommandOrControl+Shift+W';
  try {
    const ok = globalShortcut.register(hotkey, async () => {
      const cursor = screen.getCursorScreenPoint();
      await summonPopup(cursor);
    });
    if (ok) {
      console.info(`[FlowWrite] Ready. Press ${hotkey} to summon the popup.`);
    } else {
      console.warn(`[FlowWrite] Hotkey ${hotkey} could not be registered (in use by another app?).`);
    }
  } catch (err) {
    console.warn('[FlowWrite] Could not register hotkey:', err.message);
  }

  // First-launch UX: if no API key is set, open Settings so the user has
  // somewhere obvious to begin. (Tray menu also works, but on macOS the tray
  // icon can be hard to spot — this is a friendlier default.)
  const apiKey = store.get('settings').anthropicApiKey;
  if (!apiKey) {
    setTimeout(() => openMainWindowOn('settings'), 400);
  }
});

app.on('window-all-closed', (e) => {
  // Never quit when windows close — tray is the source of truth.
  e.preventDefault();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// ---------------------------------------------------------------------------
// IPC channels
// ---------------------------------------------------------------------------

ipcMain.handle('show-popup', async () => {
  const cursor = screen.getCursorScreenPoint();
  await summonPopup(cursor);
});

/**
 * Called from the Dashboard when the user clicks a template card. Hides the
 * main window, summons the popup at screen center, and tells the popup which
 * template to pre-apply.
 */
ipcMain.handle('apply-template', async (_e, templateId) => {
  if (mainWindow?.isVisible()) mainWindow.hide();
  const display = screen.getPrimaryDisplay();
  const wa = display.workArea;
  // Centre of the work area minus half the popup size (320×540).
  const pos = {
    x: Math.round(wa.x + wa.width / 2),
    y: Math.round(wa.y + wa.height / 2 - 100),
  };
  await summonPopup(pos, { templateId });
});

ipcMain.handle('hide-popup', () => {
  hidePopup(popupWindow);
});

ipcMain.handle('get-settings', () => store.get('settings'));

ipcMain.handle('save-settings', (_e, next) => {
  store.set('settings', { ...store.get('settings'), ...next });
  return store.get('settings');
});

ipcMain.handle('get-history', () => store.get('history'));

ipcMain.handle('add-history', (_e, entry) => {
  const history = store.get('history');
  const updated = [{ ...entry, timestamp: Date.now() }, ...history].slice(0, 50);
  store.set('history', updated);
  return updated;
});

ipcMain.handle('clear-history', () => {
  store.set('history', []);
  return [];
});

// ── User-defined templates (few-shot style examples) ─────────────────────────

ipcMain.handle('get-user-templates', () => store.get('userTemplates') || []);

ipcMain.handle('save-user-template', (_e, template) => {
  const list = store.get('userTemplates') || [];
  const now = Date.now();
  const incoming = {
    name: '',
    platform: '',
    content: '',
    notes: '',
    ...template,
    updatedAt: now,
  };
  let updated;
  if (incoming.id) {
    const idx = list.findIndex((t) => t.id === incoming.id);
    if (idx >= 0) {
      updated = list.slice();
      updated[idx] = { ...list[idx], ...incoming };
    } else {
      updated = [{ ...incoming, createdAt: now }, ...list];
    }
  } else {
    incoming.id = `ut-${now}-${Math.random().toString(36).slice(2, 8)}`;
    incoming.createdAt = now;
    updated = [incoming, ...list];
  }
  store.set('userTemplates', updated);
  return updated;
});

ipcMain.handle('delete-user-template', (_e, id) => {
  const list = store.get('userTemplates') || [];
  const updated = list.filter((t) => t.id !== id);
  store.set('userTemplates', updated);
  return updated;
});

/**
 * Google OAuth code-flow handler.
 *
 * Renderer calls this with the Google Desktop OAuth client ID (read from
 * firebaseConfig.js). We open the OS browser, capture the auth code on a
 * local loopback port, exchange it for tokens (PKCE — no client secret
 * needed), and return the Google id_token. The renderer then uses that to
 * sign into Firebase via signInWithCredential().
 */
ipcMain.handle('google-sign-in', async (_event, { clientId, clientSecret } = {}) => {
  try {
    const tokens = await googleSignIn(clientId, clientSecret);
    return { ok: true, ...tokens };
  } catch (err) {
    console.error('[FlowWrite] google-sign-in failed:', err.message);
    return { ok: false, error: err.message || String(err) };
  }
});

/**
 * Call Claude directly from the main process (Architecture A — no Blaze).
 * The Anthropic API key is read from electron-store (set via Settings).
 * Text chunks are pushed to the renderer window via `generate:chunk` events
 * so claudeClient.js can stream them into the popup.
 */
ipcMain.handle('generate-text', async (event, { prompt }) => {
  const apiKey = store.get('settings').anthropicApiKey;
  if (!apiKey) {
    return {
      ok: false,
      error: 'No Anthropic API key set. Open Settings → paste your sk-ant-… key.',
    };
  }

  try {
    const client = new Anthropic({ apiKey });
    const stream = client.messages.stream({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    let full = '';
    for await (const chunk of stream) {
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta?.type === 'text_delta'
      ) {
        const text = chunk.delta.text;
        full += text;
        // Push each chunk to the renderer that owns this request.
        event.sender.send('generate:chunk', text);
      }
    }

    return { ok: true, text: full };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('autofill-text', async (_e, { text, targetField }) => {
  try {
    const { tier } = await autoFillText(text, targetField);
    // 'clipboard-only' means nut-js + AppleScript both failed; the user needs
    // to paste manually. The renderer can surface a hint based on this.
    return { ok: true, tier };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
