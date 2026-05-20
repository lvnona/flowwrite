# Icon placeholders

Drop these binary assets in before packaging:

- `tray-icon.png` — 16×16 (also include `@2x` and `@3x` for retina if you can).
  Should be a template image on macOS (mostly transparent + monochrome) so it
  adapts to dark/light menu bars.
- `app-icon.png` — 512×512 PNG used for macOS bundling.
- `app-icon.ico` — multi-resolution ICO for the Windows NSIS installer.

The Electron tray code gracefully falls back to an empty `nativeImage` if these
are missing, so the app still launches in dev without them.
