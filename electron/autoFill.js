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

async function fillViaWindows(text, { selectAll = true, hwnd = null } = {}) {
  if (process.platform !== 'win32') throw new Error('SendKeys: Windows only');

  clipboard.writeText(text);

  // SendKeys: ^a = Ctrl+A (select all), ^v = Ctrl+V (paste). Insert mode pastes
  // at the cursor (no select-all). Strings are PS single-quoted so the carets
  // are literal; execFile (no shell) avoids cmd.exe caret-escaping issues.
  const sendSeq = selectAll
    ? "[System.Windows.Forms.SendKeys]::SendWait('^a'); Start-Sleep -Milliseconds 40; [System.Windows.Forms.SendKeys]::SendWait('^v')"
    : "[System.Windows.Forms.SendKeys]::SendWait('^v')";

  // Restore focus to the window the user summoned the popup from. After we hide
  // our popup, Windows doesn't reliably hand focus back, and a bare
  // SetForegroundWindow gets rejected by the OS foreground lock — so we briefly
  // attach our input thread to the current foreground thread, which lets the
  // call through. Sanitised to digits so it can't inject into the script.
  const numericHwnd = hwnd != null ? String(hwnd).replace(/[^0-9-]/g, '') : '';
  const focusBlock = numericHwnd
    ? [
        'Add-Type @"',
        'using System;',
        'using System.Runtime.InteropServices;',
        'public class Fg {',
        '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);',
        '  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);',
        '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
        '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
        '  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool c);',
        '  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();',
        '}',
        '"@',
        `$target = [IntPtr]${numericHwnd}`,
        '$fg = [Fg]::GetForegroundWindow()',
        '$procId = [uint32]0',
        '$fgThread = [Fg]::GetWindowThreadProcessId($fg, [ref]$procId)',
        '$myThread = [Fg]::GetCurrentThreadId()',
        '[Fg]::AttachThreadInput($fgThread, $myThread, $true) | Out-Null',
        '[Fg]::ShowWindow($target, 9) | Out-Null',
        '[Fg]::SetForegroundWindow($target) | Out-Null',
        '[Fg]::AttachThreadInput($fgThread, $myThread, $false) | Out-Null',
        'Start-Sleep -Milliseconds 90',
      ].join('\n')
    : 'Start-Sleep -Milliseconds 120'; // no handle — just wait for focus to settle

  const script = ['Add-Type -AssemblyName System.Windows.Forms', focusBlock, sendSeq].join('\n');

  // Pass the script as a Base64 (UTF-16LE) blob via -EncodedCommand. The script
  // contains C# double-quotes (e.g. "user32.dll") and a here-string; routing
  // those through normal command-line quoting on Windows mangles them, whereas
  // an encoded command has no quoting concerns at all.
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  await pexecFile('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded]);
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
  // targetField.hwnd (Windows) lets us re-focus the original window before paste.
  return runFill(text, { selectAll: true, hwnd: targetField?.hwnd ?? null });
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
