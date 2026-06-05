// The voice-dictation overlay — a thin pill that sits bottom-center, just
// above the Dock (Wispr Flow style). It shows a live audio equalizer while you
// hold Fn, then a "transcribing" state, then disappears.
//
// CRITICAL: this window is created with `focusable: false` and shown with
// `showInactive()`, so summoning it NEVER moves keyboard focus away from the
// app you're typing in. That's what lets the transcribed text paste back into
// the field where your cursor already was.

import { BrowserWindow, screen, app } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

const BAR_WIDTH = 240;
const BAR_HEIGHT = 64;
const isWin = process.platform === 'win32';

// Windows drops the "topmost" flag on a non-focusable window whenever another
// window is activated, so the bar gets buried. We re-assert topmost on a short
// timer while the bar is visible. (macOS keeps it on top reliably — no timer.)
let keepOnTopTimer = null;
function startKeepOnTop(win) {
  stopKeepOnTop();
  if (!isWin) return;
  keepOnTopTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    try { win.setAlwaysOnTop(true, 'screen-saver'); win.moveTop(); } catch { /* ignore */ }
  }, 300);
}
function stopKeepOnTop() {
  if (keepOnTopTimer) { clearInterval(keepOnTopTimer); keepOnTopTimer = null; }
}

export function createDictationWindow() {
  const win = new BrowserWindow({
    width: BAR_WIDTH,
    height: BAR_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,        // never take keyboard focus
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // Keep the renderer alive when hidden so the mic/AudioContext spin up fast.
      backgroundThrottling: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (isDev) {
    win.loadURL('http://localhost:5173/?route=dictation');
  } else {
    win.loadFile(join(__dirname, '..', 'dist', 'index.html'), {
      query: { route: 'dictation' },
    });
  }

  return win;
}

/** Position bottom-center on the display under the cursor, then show inactive. */
export function showDictationBar(win) {
  if (!win || win.isDestroyed()) return;   // destroyed-but-non-null guard
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const wa = display.workArea; // excludes Dock / menu bar

  const x = Math.round(wa.x + (wa.width - BAR_WIDTH) / 2);
  const y = Math.round(wa.y + wa.height - BAR_HEIGHT - 16);
  win.setPosition(x, y);
  win.showInactive(); // show WITHOUT activating / stealing focus
  // Re-assert topmost on show (Windows can have dropped it since last time),
  // then keep re-asserting while visible so other windows can't bury it.
  try { win.setAlwaysOnTop(true, 'screen-saver'); win.moveTop(); } catch { /* ignore */ }
  startKeepOnTop(win);
}

export function hideDictationBar(win) {
  stopKeepOnTop();
  if (win && !win.isDestroyed() && win.isVisible()) win.hide();
}
