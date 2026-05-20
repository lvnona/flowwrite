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
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const pexec = promisify(exec);

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

async function fillViaNutJS(text) {
  const kb = await loadNutJS();
  if (!kb) throw new Error('nut-js unavailable');

  clipboard.writeText(text);

  // Give the target app time to regain focus after the popup window hides.
  await delay(90);

  const mod = process.platform === 'darwin' ? _Key.LeftCmd : _Key.LeftControl;

  await kb.pressKey(mod, _Key.A);
  await kb.releaseKey(mod, _Key.A);
  await delay(20);
  await kb.pressKey(mod, _Key.V);
  await kb.releaseKey(mod, _Key.V);
}

// ─────────────────────────────────────────────────────────
// Tier 2 — AppleScript (macOS only)
// ─────────────────────────────────────────────────────────

async function fillViaAppleScript(text) {
  if (process.platform !== 'darwin') throw new Error('AppleScript: macOS only');

  // Write to clipboard first — AppleScript "keystroke" is slow for long text.
  clipboard.writeText(text);

  // tell frontmost app to paste. We use delay 0.1 after giving focus back.
  const script = `
    delay 0.15
    tell application "System Events"
      keystroke "a" using {command down}
      delay 0.05
      keystroke "v" using {command down}
    end tell
  `;
  await pexec(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
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

/**
 * @param {string} text          Generated text to inject.
 * @param {object} _targetField  Field context (reserved for future focus-restore).
 * @returns {Promise<{tier: string}>}  Which tier was used.
 */
export async function autoFillText(text, _targetField) {
  if (!text) return { tier: 'noop' };

  // Tier 1 — nut-js
  try {
    await fillViaNutJS(text);
    return { tier: 'nut-js' };
  } catch (e1) {
    console.info('[FlowWrite] autoFill tier-1 failed, trying tier-2:', e1.message);
  }

  // Tier 2 — AppleScript
  try {
    await fillViaAppleScript(text);
    return { tier: 'applescript' };
  } catch (e2) {
    console.info('[FlowWrite] autoFill tier-2 failed, falling back to clipboard:', e2.message);
  }

  // Tier 3 — clipboard only
  const mode = fillViaClipboard(text);
  return { tier: mode };
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
