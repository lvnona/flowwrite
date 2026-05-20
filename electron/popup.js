// The floating popup window.
// Frameless, transparent, always-on-top. Sized 320×420. Hidden by default.
// Auto-hides on blur (click-outside) and on Escape (handled in the renderer).

import { BrowserWindow, screen, app } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

const POPUP_WIDTH = 320;
const POPUP_HEIGHT = 540;

export function createPopupWindow() {
  const win = new BrowserWindow({
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Stay above full-screen apps too.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (isDev) {
    win.loadURL('http://localhost:5173/?route=popup');
  } else {
    win.loadFile(join(__dirname, '..', 'dist', 'index.html'), {
      query: { route: 'popup' },
    });
  }

  // Click-outside → hide. We only react when the popup is currently visible.
  win.on('blur', () => {
    if (win.isVisible()) win.hide();
  });

  return win;
}

/**
 * Position the popup 20px to the right of the cursor and clamp to screen bounds,
 * then push the latest fieldContext to the renderer before showing.
 */
export function showPopupAt(win, position, fieldContext) {
  if (!win) return;

  const display = screen.getDisplayNearestPoint(position);
  const work = display.workArea;

  let x = position.x + 20;
  let y = position.y - 20;

  if (x + POPUP_WIDTH > work.x + work.width) {
    // Flip to the left of the cursor when there is no room on the right.
    x = position.x - POPUP_WIDTH - 20;
  }
  if (y + POPUP_HEIGHT > work.y + work.height) {
    y = work.y + work.height - POPUP_HEIGHT - 10;
  }
  if (y < work.y) y = work.y + 10;

  win.setPosition(Math.round(x), Math.round(y));
  win.webContents.send('popup:context', fieldContext);
  win.showInactive();
  win.focus();
}

export function hidePopup(win) {
  if (win && win.isVisible()) win.hide();
}
