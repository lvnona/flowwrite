# FlowWrite

AI writing assistant that lives in your system tray. Hover over any text field
in any application; a floating popup appears, lets you pick a content
type / tone / length, streams text from Claude, and auto-fills the field.

## Quickstart

```bash
cd FlowWrite
npm install
cp .env.example .env       # optional — API key is normally stored via Settings
npm run dev
```

`npm run dev` starts Vite on `http://localhost:5173` and launches Electron once
the dev server is ready. The popup window is hidden by default — trigger it by:

- Pressing the global hotkey (`Cmd/Ctrl+Shift+W` by default).
- Letting the cursor sit still over a text field for ~800ms.
- Right-click the tray icon → "Open Settings" / "View History".

Open **Settings** and paste your Anthropic API key before generating anything.

## Packaging

```bash
npm run package:mac    # signed .dmg / .app
npm run package:win    # NSIS installer
```

## Layout

```
electron/    main-process code (windows, tray, IPC, native bridges)
src/         React renderer — popup, settings, history
public/      static assets (icons)
build/       entitlements + electron-builder resources
```

## Notes & caveats

- **iohook is not used.** It's unmaintained against modern Electron. Hover
  detection polls `screen.getCursorScreenPoint` every 120ms instead — no native
  build, works on macOS and Windows.
- **Native field detection is stubbed.** The original spec mentions AXUIElement
  on macOS and UI Automation on Windows. Both require a real native binding;
  for now `contextReader.js` returns app + window-title context and
  `fieldDetector.js` defaults `isTextField: true`. Wire in a native addon when
  you're ready.
- **macOS Accessibility permission** is required for `autoFill.js` to send
  keystrokes via `@nut-tree-fork/nut-js`. The app should prompt you the first
  time it tries to type.
- The Claude API call lives entirely in the main process so the API key never
  reaches the renderer. Streaming chunks come back via the `generate-text:chunk`
  IPC event.
