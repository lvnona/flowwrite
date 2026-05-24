// Auto-fill generated text into the previously-focused field.
//
// STRATEGY (tried in order, first success wins):
//
//   Tier 1 — nut-js keystrokes (preferred, works silently in most native apps)
//     • Hide popup (focus goes back to the target app automatically)
//     • Wait 90ms for the OS to transfer focus
//     • Cmd/Ctrl + A  → select all
//     • Cmd/Ctrl + V  → paste from clipboard
//
//   Tier 2 — AppleScript paste (macOS fallback when nut-js is unavailable)
//     • Writes text to clipboard
//     • Sends keystroke "v" using command to the frontmost app
//
//   Tier 3 — clipboard-only
//     • Writes text to clipboard, notifies the renderer that the user must paste

import { clipboard } from 'electron';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pexec = promisify(exec);
const pexecFile = promisify(execFile);

// ─────────────────────────────────────────────────────────
// Tier 1 — nut-js
// ─────────────────────────────────────────────────────────

let _kb = null;
let _Key = null;

async function loadNutJS() {
  if (_kb !== null) return _kb;
  try {
    const nut = await import('@nut-tree-fork/nut-js');
    _kb = nut.keyboard;
    _Key = nut.Key;
    _kb.config.autoDelayMs = 15;
    console.info('[FlowWrite] nut-js keyboard loaded');
  } catch (err) {
    console.warn('[FlowWrite] nut-js not available:', err.message);
    _kb = false;
  }
  return _kb;
}

async function fillViaNutJS(text, { selectAll = true } = {}) {
  const kb = await loadNutJS();
  if (!kb) throw new Error('nut-js unavailable');

  clipboard.writeText(text);

  // Give the target app time to regain focus after the popup window hides.
  await delay(90);

  const mod = process.platform === 'darwin' ? _Key.LeftCmd : _Key.LeftControl;

  // Replace mode (popup) selects all first; insert mode (dictation) does not,
  // so the transcript drops in at the current cursor position.
  if (selectAll) {
    await kb.pressKey(mod, _Key.A);
    await kb.releaseKey(mod, _Key.A);
    await delay(20);
  }
  await kb.pressKey(mod, _Key.V);
  await kb.releaseKey(mod, _Key.V);
}

// ─────────────────────────────────────────────────────────
// Tier 2 — AppleScript (macOS only)
// ─────────────────────────────────────────────────────────

async function fillViaAppleScript(text, { selectAll = true } = {}) {
  if (process.platform !== 'darwin') throw new Error('AppleScript: macOS only');

  // Write to clipboard first — AppleScript "keystroke" is slow for long text.
  clipboard.writeText(text);

  // tell frontmost app to paste. We use delay 0.1 after giving focus back.
  const selectAllLine = selectAll
    ? 'keystroke "a" using {command down}\n      delay 0.05'
    : '';
  const script = `
    delay 0.15
    tell application "System Events"
      ${selectAllLine}
      keystroke "v" using {command down}
    end tell
  `;
  await pexec(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
}

// ─────────────────────────────────────────────────────────
// Tier 2 (Windows) — PowerShell SendKeys
// ─────────────────────────────────────────────────────────

async function fillViaWindows(text, { selectAll = true, pid = null } = {}) {
  if (process.platform !== 'win32') throw new Error('SendKeys: Windows only');

  clipboard.writeText(text);

  // Re-focus the window the user came from BEFORE pasting. We use the
  // WScript.Shell COM object's AppActivate(pid) — it needs NO C# compilation
  // (the old Add-Type/P-Invoke approach could fail at runtime and silently drop
  // us to clipboard-only, which is the "I have to press Ctrl+V" bug). For
  // dictation there's no pid (the bar never steals focus) so we just wait.
  const numericPid = pid != null ? String(pid).replace(/[^0-9]/g, '') : '';
  const focus = numericPid
    ? `$null = (New-Object -ComObject WScript.Shell).AppActivate([int]${numericPid}); Start-Sleep -Milliseconds 130`
    : 'Start-Sleep -Milliseconds 140';

  // SendKeys: ^a = select all (replace mode), ^v = paste. SendKeys lives in the
  // precompiled System.Windows.Forms assembly, so Add-Type -AssemblyName just
  // loads it (no Roslyn/csc compilation → reliable).
  const send = selectAll
    ? "[System.Windows.Forms.SendKeys]::SendWait('^a'); Start-Sleep -Milliseconds 45; [System.Windows.Forms.SendKeys]::SendWait('^v')"
    : "[System.Windows.Forms.SendKeys]::SendWait('^v')";

  const script = `Add-Type -AssemblyName System.Windows.Forms; ${focus}; ${send}`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');

  // Use the absolute powershell path so packaging / PATH quirks can't break it.
  const psPath = process.env.SystemRoot
    ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
    : 'powershell';
  await pexecFile(psPath, ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded]);
}

// ─────────────────────────────────────────────────────────
// Tier 3 — clipboard only
// ─────────────────────────────────────────────────────────

function fillViaClipboard(text) {
  clipboard.writeText(text);
  // Callers should surface a "Paste manually" hint to the user.
  return 'clipboard-only';
}

// ─────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────

// Shared 3-tier fill chain. `selectAll` distinguishes replace mode (popup,
// selects the whole field first) from insert mode (dictation, pastes at the
// cursor without disturbing existing text).
async function runFill(text, opts) {
  if (!text) return { tier: 'noop' };

  // Tier 1 — nut-js
  try {
    await fillViaNutJS(text, opts);
    return { tier: 'nut-js' };
  } catch (e1) {
    console.info('[FlowWrite] autoFill tier-1 failed, trying tier-2:', e1.message);
  }

  // Tier 2 — OS-native keystrokes (AppleScript on macOS, SendKeys on Windows)
  try {
    if (process.platform === 'darwin') {
      await fillViaAppleScript(text, opts);
      return { tier: 'applescript' };
    }
    if (process.platform === 'win32') {
      await fillViaWindows(text, opts);
      return { tier: 'sendkeys' };
    }
    throw new Error('no native keystroke tier for this platform');
  } catch (e2) {
    console.info('[FlowWrite] autoFill tier-2 failed, falling back to clipboard:', e2.message);
  }

  // Tier 3 — clipboard only
  const mode = fillViaClipboard(text);
  return { tier: mode };
}

/**
 * Replace the focused field's contents with `text` (select-all then paste).
 * Used by the content popup's "Insert".
 * @returns {Promise<{tier: string}>}  Which tier was used.
 */
export async function autoFillText(text, targetField) {
  // targetField.pid (Windows) lets us re-focus the original window before paste.
  return runFill(text, { selectAll: true, pid: targetField?.pid ?? null });
}

/**
 * Insert `text` at the current cursor position (paste only, no select-all).
 * Used by voice dictation so spoken text drops in wherever you were typing.
 * @returns {Promise<{tier: string}>}  Which tier was used.
 */
export async function insertAtCursor(text) {
  return runFill(text, { selectAll: false });
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
