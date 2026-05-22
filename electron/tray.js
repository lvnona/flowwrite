// System tray icon + right-click menu.
// The tray is the canonical entry point — closing windows must not quit the app.

import { Tray, Menu, nativeImage, app } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Builds the tray. Callers pass handlers so this module stays UI-only.
 *
 * @param {object} opts
 * @param {() => void} opts.onOpenSettings
 * @param {() => void} opts.onOpenHistory
 * @param {() => boolean} opts.onTogglePause - returns the new paused state
 * @param {() => boolean} opts.isPaused
 * @param {() => void} opts.onQuit
 */
export function createTray(opts) {
  // macOS menu bar wants a monochrome *template* icon (it inverts it for
  // light/dark). Windows/Linux show the white version as-is. Both have @2x
  // variants alongside, which nativeImage picks up automatically on retina.
  const isMac = process.platform === 'darwin';
  const iconFile = isMac ? 'tray-iconTemplate.png' : 'tray-icon.png';
  const iconPath = join(__dirname, '..', 'public', 'icons', iconFile);
  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    // Fallback so the tray still appears if the asset is missing in dev.
    image = nativeImage.createEmpty();
  } else if (isMac) {
    image.setTemplateImage(true); // adapts to the menu bar's light/dark theme
  }

  const tray = new Tray(image);
  tray.setToolTip('FlowWrite');

  const rebuildMenu = () => {
    const paused = opts.isPaused();
    const hotkeyLabel = (opts.getHotkey?.() || 'CommandOrControl+Shift+W')
      .replace('CommandOrControl', process.platform === 'darwin' ? '⌘' : 'Ctrl')
      .replace('Command', '⌘')
      .replace('Control', 'Ctrl')
      .replace('Shift', '⇧')
      .replace('Alt', '⌥')
      .replace('Option', '⌥')
      .replaceAll('+', '');
    const menu = Menu.buildFromTemplate([
      { label: paused ? 'FlowWrite — Paused' : 'FlowWrite — Active', enabled: false },
      { label: `Press ${hotkeyLabel} to summon`, enabled: false },
      { type: 'separator' },
      { label: 'Summon popup now', click: opts.onSummon, accelerator: opts.getHotkey?.() },
      { label: 'Dashboard', click: opts.onOpenDashboard },
      { label: 'History', click: opts.onOpenHistory },
      { label: 'Settings', click: opts.onOpenSettings },
      {
        label: paused ? 'Resume' : 'Pause',
        click: () => {
          opts.onTogglePause();
          rebuildMenu();
        },
      },
      { type: 'separator' },
      { label: 'Quit', click: opts.onQuit },
    ]);
    tray.setContextMenu(menu);
  };

  rebuildMenu();

  app.on('before-quit', () => {
    tray.destroy();
  });

  return tray;
}
