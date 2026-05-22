// Settings page — preferences + account.
//
// API key field is gone (the API key lives only on the server now). What
// remains: hotkey, niche, default tone/length preferences, account info,
// sign out.

import React, { useEffect, useState } from 'react';
import { TONES } from '../components/TonePicker.jsx';
import { LENGTHS } from '../components/LengthPicker.jsx';
import NavBar from '../components/NavBar.jsx';
import { useAuth } from '../hooks/useAuth.js';

const NICHES = ['Real Estate', 'Recruitment', 'Sales', 'General', 'Custom'];

export default function Settings() {
  const { user, profile, signOut } = useAuth();

  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState(false);
  const [stats, setStats] = useState(null);
  const [devices, setDevices] = useState([]);

  useEffect(() => {
    window.flowwrite?.getSettings?.().then(setSettings);
    window.flowwrite?.getTranscriberStats?.().then(setStats);
  }, []);

  // Enumerate audio input devices for the mic picker; refresh on hot-plug.
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return undefined;
    let cancelled = false;
    const refresh = () => {
      navigator.mediaDevices.enumerateDevices()
        .then((list) => {
          if (!cancelled) setDevices(list.filter((d) => d.kind === 'audioinput' && d.deviceId));
        })
        .catch(() => {});
    };
    refresh();
    navigator.mediaDevices.addEventListener?.('devicechange', refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.('devicechange', refresh);
    };
  }, []);

  // If the chosen mic disappears, revert to the system default (built-in).
  useEffect(() => {
    if (!settings?.micDeviceId || devices.length === 0) return;
    if (!devices.some((d) => d.deviceId === settings.micDeviceId)) {
      setSettings((s) => ({ ...s, micDeviceId: '' }));
      window.flowwrite?.saveSettings?.({ micDeviceId: '' });
    }
  }, [devices, settings?.micDeviceId]);

  if (!settings) {
    return <div className="page-bg p-8 text-white/60">Loading…</div>;
  }

  function update(patch) {
    setSettings((s) => ({ ...s, ...patch }));
    setSaved(false);
  }

  async function handleSave() {
    const next = await window.flowwrite?.saveSettings?.(settings);
    setSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  // Persist a single field immediately (for live controls like the mic picker).
  async function saveNow(patch) {
    setSettings((s) => ({ ...s, ...patch }));
    try { await window.flowwrite?.saveSettings?.(patch); } catch { /* ignore */ }
  }

  const hotkeyHuman = (settings.hotkey || 'CommandOrControl+Shift+W')
    .replace('CommandOrControl', navigator.platform.includes('Mac') ? '⌘' : 'Ctrl')
    .replace('Command', '⌘')
    .replace('Control', 'Ctrl')
    .replace('Shift', '⇧')
    .replace('Alt', '⌥')
    .replace('Option', '⌥')
    .split('+').filter(Boolean).join(' ');

  return (
    <div className="page-bg p-8 max-w-2xl mx-auto text-white">
      <NavBar active="settings" />
      <h1 className="text-xl font-semibold mb-2">Settings</h1>

      {/* Account card */}
      {user && (
        <div className="mb-6 mt-4 p-4 rounded-xl border border-white/10 bg-white/[0.04] flex items-center gap-4">
          {user.photoURL && (
            <img
              src={user.photoURL}
              alt=""
              className="w-10 h-10 rounded-full"
              referrerPolicy="no-referrer"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{user.displayName || 'Signed in'}</div>
            <div className="text-xs text-white/50 truncate">{user.email}</div>
            <div className="text-[11px] text-white/40 mt-0.5">
              Plan: <span className="text-accentSoft">{profile?.plan || 'free'}</span>
            </div>
          </div>
          <button
            type="button"
            className="pill text-[12px]"
            onClick={signOut}
            title="Sign out"
          >
            Sign out
          </button>
        </div>
      )}

      {/* How-it-works banner */}
      <div className="mb-6 p-4 rounded-xl border border-accent/40 bg-accent/10">
        <div className="text-sm font-medium mb-1">How FlowWrite works</div>
        <p className="text-xs text-white/70 leading-relaxed">
          FlowWrite runs silently in your menu bar. Whenever you want AI help in
          any app, click into a text field and press{' '}
          <kbd className="kbd">{hotkeyHuman}</kbd>.
          The popup detects which app you're in, lets you pick a tone/length,
          then pastes the generated text into the focused field.
        </p>
      </div>

      <Field label="Default tone">
        <select
          className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus:outline-none focus:border-accent"
          value={settings.defaultTone}
          onChange={(e) => update({ defaultTone: e.target.value })}
        >
          {TONES.map((t) => (
            <option key={t} value={t} className="bg-bg">{t}</option>
          ))}
        </select>
      </Field>

      <Field label="Default length">
        <select
          className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus:outline-none focus:border-accent"
          value={settings.defaultLength}
          onChange={(e) => update({ defaultLength: e.target.value })}
        >
          {LENGTHS.map((l) => (
            <option key={l} value={l} className="bg-bg">{l}</option>
          ))}
        </select>
      </Field>

      {/* ─── Audio transcriber ───────────────────────────────────────── */}
      <div className="mt-8 mb-4 pt-5 border-t border-white/10">
        <h2 className="text-sm font-semibold text-white/80">Audio transcriber</h2>
        <p className="text-[11px] text-white/40 mt-0.5">
          Voice-to-text for the popup 🎤 button and hold-Fn dictation.
        </p>
      </div>

      <label className="flex items-start gap-3 mb-4 cursor-pointer select-none">
        <input
          type="checkbox"
          className="mt-0.5 w-4 h-4 accent-accent"
          checked={settings.transcriberEnabled !== false}
          onChange={(e) => update({ transcriberEnabled: e.target.checked })}
        />
        <span>
          <span className="block text-sm">Enable voice transcription</span>
          <span className="block text-[11px] text-white/40">
            Master switch for the popup microphone and hold-Fn voice typing.
            Restart FlowWrite after changing.
          </span>
        </span>
      </label>

      <div className="mb-4 p-3 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-white/40">
          Words transcribed
        </span>
        <span className="text-lg font-semibold text-accentSoft tabular-nums">
          {(stats?.words ?? 0).toLocaleString()}
        </span>
      </div>

      <Field label="Microphone input">
        <select
          className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus:outline-none focus:border-accent"
          value={settings.micDeviceId || ''}
          onChange={(e) => saveNow({ micDeviceId: e.target.value })}
        >
          <option value="" className="bg-bg">Built-in / system default</option>
          {devices.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId} className="bg-bg">
              {d.label || `Microphone ${i + 1}`}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-white/40 mt-1">
          Pick a connected mic (e.g. Bluetooth headset). If it disconnects,
          FlowWrite automatically switches back to the built-in mic.
        </p>
      </Field>

      <label className="flex items-start gap-3 mb-4 cursor-pointer select-none">
        <input
          type="checkbox"
          className="mt-0.5 w-4 h-4 accent-accent"
          checked={settings.polishDictation !== false}
          onChange={(e) => update({ polishDictation: e.target.checked })}
        />
        <span>
          <span className="block text-sm">Clean up dictation grammar</span>
          <span className="block text-[11px] text-white/40">
            After transcribing your voice, fix punctuation/grammar and remove
            filler words ("um", "uh"). Turn off for word-for-word transcripts.
          </span>
        </span>
      </label>

      <Field label="Dictation shortcut">
        <DictationShortcut
          value={settings.dictationHotkey || ''}
          onChange={(v) => saveNow({ dictationHotkey: v })}
        />
      </Field>

      <Field label="Manual hotkey">
        <input
          type="text"
          className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus:outline-none focus:border-accent"
          value={settings.hotkey || ''}
          onChange={(e) => update({ hotkey: e.target.value })}
          placeholder="CommandOrControl+Shift+W"
        />
        <p className="text-[11px] text-white/40 mt-1">
          Restart FlowWrite for hotkey changes to take effect.
        </p>
      </Field>

      <Field label="Your niche">
        <select
          className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus:outline-none focus:border-accent"
          value={settings.niche}
          onChange={(e) => update({ niche: e.target.value })}
        >
          {NICHES.map((n) => (
            <option key={n} value={n} className="bg-bg">{n}</option>
          ))}
        </select>
      </Field>

      <div className="flex items-center gap-4 mt-6">
        <button className="gradient-btn" onClick={handleSave}>Save</button>
        {saved && <span className="text-xs text-green-300">Saved ✓</span>}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-4">
      <span className="block text-xs uppercase tracking-wider text-white/40 mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

// ── Dictation shortcut picker ────────────────────────────────────────────────
// Captures a key combination, or sets the special 'Fn' (macOS hold) / 'Off' /
// '' (platform default) values. The browser can't see the Fn key, so it's set
// via a button rather than captured.

function normalizeKey(e) {
  const { code, key } = e;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null; // modifier only
  if (code === 'Space' || key === ' ') return 'Space';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);   // KeyA → A
  if (/^Digit\d$/.test(code)) return code.slice(5);    // Digit1 → 1
  if (/^F\d{1,2}$/.test(key)) return key;              // F1..F24
  const arrows = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' };
  if (arrows[key]) return arrows[key];
  const named = ['Enter', 'Tab', 'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown'];
  if (named.includes(key)) return key;
  if (key.length === 1) return key.toUpperCase();
  return null;
}

function eventToAccelerator(e) {
  const key = normalizeKey(e);
  if (!key) return null; // still only modifiers held — keep waiting
  const parts = [];
  if (e.ctrlKey) parts.push('Control');
  if (e.metaKey) parts.push('Command');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

function humanizeHotkey(value, isMac) {
  if (value === 'Off') return 'Off';
  if (value === 'Fn') return 'Fn (hold)';
  if (!value) return isMac ? 'Fn (hold)' : 'Ctrl + Shift + Space';
  return value
    .replace('CommandOrControl', isMac ? '⌘' : 'Ctrl')
    .replace('Command', '⌘')
    .replace('Control', 'Ctrl')
    .replace('Option', '⌥')
    .replace('Alt', isMac ? '⌥' : 'Alt')
    .replace('Shift', '⇧')
    .split('+').join(' + ');
}

function DictationShortcut({ value, onChange }) {
  const [recording, setRecording] = useState(false);
  const isMac = navigator.platform.includes('Mac');

  useEffect(() => {
    if (!recording) return undefined;
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { setRecording(false); return; }
      const accel = eventToAccelerator(e);
      if (accel) { onChange(accel); setRecording(false); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, onChange]);

  const hint =
    value === 'Fn' || (value === '' && isMac)
      ? 'Hold Fn / 🌐 to talk, release to insert (macOS). Tip: set System Settings → Keyboard → Press 🌐 to → Do Nothing.'
      : value === 'Off'
        ? 'No global dictation shortcut — the popup 🎤 button still works.'
        : 'Tap to start dictating, tap again to stop. Combinations and single keys (e.g. F-keys) work; a bare modifier alone isn\'t supported except Fn.';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 font-mono min-w-[150px] text-center">
          {recording ? 'Press keys… (Esc cancels)' : humanizeHotkey(value, isMac)}
        </span>
        <button type="button" className="pill text-[12px]" onClick={() => setRecording(true)}>
          {recording ? 'Listening…' : 'Set shortcut'}
        </button>
        {isMac && (
          <button type="button" className="pill text-[12px]" onClick={() => onChange('Fn')}>
            Use Fn
          </button>
        )}
        <button type="button" className="pill text-[12px]" onClick={() => onChange('')}>
          Default
        </button>
        <button type="button" className="pill text-[12px]" onClick={() => onChange('Off')}>
          Off
        </button>
      </div>
      <p className="text-[11px] text-white/40">{hint}</p>
    </div>
  );
}
