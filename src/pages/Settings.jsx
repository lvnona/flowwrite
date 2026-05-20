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

  useEffect(() => {
    window.flowwrite?.getSettings?.().then(setSettings);
  }, []);

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

      <Field label="Anthropic API key">
        <input
          type="password"
          className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus:outline-none focus:border-accent font-mono"
          value={settings.anthropicApiKey || ''}
          onChange={(e) => update({ anthropicApiKey: e.target.value })}
          placeholder="sk-ant-api03-…"
          autoComplete="off"
          spellCheck={false}
        />
        <p className="text-[11px] text-white/40 mt-1">
          Get yours at{' '}
          <a
            href="https://console.anthropic.com/account/keys"
            target="_blank"
            rel="noreferrer"
            className="text-accentSoft underline"
          >
            console.anthropic.com
          </a>
          . Stored locally — never sent to any server.
        </p>
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
