// Settings page — two tabs:
//   • General   — account, preferences, audio transcriber, hotkeys, niche.
//   • Templates — all user templates (any purpose), with purpose + platform
//                 filters. Each template carries a purpose (Email / Post / …)
//                 and an optional platform, so they're easy to organise.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TONES } from '../components/TonePicker.jsx';
import { LENGTHS } from '../components/LengthPicker.jsx';
import NavBar from '../components/NavBar.jsx';
import TemplateModal from '../components/TemplateModal.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useTemplates } from '../hooks/useTemplates.js';

const NICHES = ['Real Estate', 'Recruitment', 'Sales', 'General', 'Custom'];

export default function Settings() {
  const { user, profile, signOut } = useAuth();
  const { templates, save: saveTemplate, remove: removeTemplate } = useTemplates();

  const [tab, setTab] = useState('general'); // 'general' | 'templates'
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState(false);
  const [stats, setStats] = useState(null);
  const [devices, setDevices] = useState([]);
  const [editing, setEditing] = useState(null);          // null | 'new' | template
  const [filterPurpose, setFilterPurpose] = useState('All');
  const [filterPlatform, setFilterPlatform] = useState('All');
  const [perms, setPerms] = useState(null);
  const [recheck, setRecheck] = useState(''); // '' | 'checking' | 'done'

  async function handleDeleteTemplate(t) {
    if (!confirm(`Delete template "${t.name}"? This cannot be undone.`)) return;
    await removeTemplate(t.id);
  }

  const refreshPerms = useCallback(async () => {
    const p = await window.flowwrite?.getPermissions?.();
    if (p) setPerms(p);
  }, []);

  // Manual re-check with visible feedback (the auto-poll is silent).
  const handleRecheck = useCallback(async () => {
    setRecheck('checking');
    const started = Date.now();
    await refreshPerms();
    // Keep "Checking…" on screen long enough to be perceptible.
    const wait = Math.max(0, 450 - (Date.now() - started));
    setTimeout(() => {
      setRecheck('done');
      setTimeout(() => setRecheck(''), 1600);
    }, wait);
  }, [refreshPerms]);

  // Load permission status; while the Permissions tab is open, keep it fresh
  // (poll + re-check on window focus) so it updates after you grant in System
  // Settings and switch back.
  useEffect(() => {
    refreshPerms();
    if (tab !== 'permissions') return undefined;
    const id = setInterval(refreshPerms, 2000);
    const onFocus = () => refreshPerms();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [tab, refreshPerms]);

  // True when nothing needs the user's attention (used for the tab warning dot).
  const permsOk = !perms
    || perms.platform !== 'darwin'
    || (perms.microphone === 'granted' && perms.accessibility === true);

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

  // ── Template filtering ──────────────────────────────────────────────────────
  // Purposes that actually have templates (so we don't show empty filter pills).
  const purposesPresent = useMemo(
    () => [...new Set(templates.map((t) => t.purpose).filter(Boolean))],
    [templates],
  );
  // Platforms present within the current purpose filter.
  const platformsPresent = useMemo(() => {
    const inScope = templates.filter((t) => filterPurpose === 'All' || t.purpose === filterPurpose);
    return [...new Set(inScope.map((t) => t.platform).filter(Boolean))];
  }, [templates, filterPurpose]);
  const filteredTemplates = useMemo(
    () => templates.filter((t) =>
      (filterPurpose === 'All' || t.purpose === filterPurpose) &&
      (filterPlatform === 'All' || (t.platform || '') === filterPlatform),
    ),
    [templates, filterPurpose, filterPlatform],
  );

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
      <h1 className="text-xl font-semibold mb-3">Settings</h1>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl bg-white/[0.04] border border-white/10 w-fit">
        {[['general', 'General'], ['templates', 'Templates'], ['permissions', 'Permissions']].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={
              'px-4 py-1.5 rounded-lg text-[13px] font-medium transition ' +
              (tab === id ? 'bg-accent text-white' : 'text-white/55 hover:text-white')
            }
          >
            {label}
            {id === 'templates' && templates.length > 0 && (
              <span className="ml-1.5 text-[11px] opacity-70">{templates.length}</span>
            )}
            {id === 'permissions' && !permsOk && (
              <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-red-400 align-middle" title="Action needed" />
            )}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <>
          {/* Account card */}
          {user && (
            <div className="mb-6 p-4 rounded-xl border border-white/10 bg-white/[0.04] flex items-center gap-4">
              {user.photoURL && (
                <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full" referrerPolicy="no-referrer" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{user.displayName || 'Signed in'}</div>
                <div className="text-xs text-white/50 truncate">{user.email}</div>
                <div className="text-[11px] text-white/40 mt-0.5">
                  Plan: <span className="text-accentSoft">{profile?.plan || 'free'}</span>
                </div>
              </div>
              <button type="button" className="pill text-[12px]" onClick={signOut} title="Sign out">
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

          <label className="flex items-start gap-3 mb-5 cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-0.5 w-4 h-4 accent-accent"
              checked={settings.launchAtLogin === true}
              onChange={(e) => saveNow({ launchAtLogin: e.target.checked })}
            />
            <span>
              <span className="block text-sm">
                Start FlowWrite when I log in to my {navigator.platform.includes('Mac') ? 'Mac' : 'computer'}
              </span>
              <span className="block text-[11px] text-white/40">
                Launches automatically in the background (menu bar / system tray) so
                it's always ready when you press your hotkey.
              </span>
            </span>
          </label>

          {/* ─── Privacy: history ─────────────────────────────────────────── */}
          <label className="flex items-start gap-3 mb-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-0.5 w-4 h-4 accent-accent"
              checked={settings.historyEnabled === true}
              onChange={(e) => saveNow({ historyEnabled: e.target.checked })}
            />
            <span>
              <span className="block text-sm">Save generation history</span>
              <span className="block text-[11px] text-white/40">
                Keeps your recent generations on the History page (stored only on
                this device). <span className="text-white/55">Off by default for privacy</span> —
                turn on only if you want a record. Handling sensitive info? Leave it off.
              </span>
            </span>
          </label>

          {settings.historyEnabled !== true && (
            <p className="text-[11px] text-accentSoft/80 mb-5 ml-7">
              History is off — nothing you generate is being stored.
            </p>
          )}
          {settings.historyEnabled === true && (
            <button
              type="button"
              className="pill text-[12px] mb-5 ml-7 text-red-300/80 border-red-400/30"
              onClick={async () => {
                if (!confirm('Delete all stored history now? This cannot be undone.')) return;
                await window.flowwrite?.clearHistory?.();
              }}
            >
              Clear history now
            </button>
          )}

          <Field label="Default tone">
            <select
              className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus:outline-none focus:border-accent"
              value={settings.defaultTone}
              onChange={(e) => update({ defaultTone: e.target.value })}
            >
              {TONES.map((t) => (<option key={t} value={t} className="bg-bg">{t}</option>))}
            </select>
          </Field>

          <Field label="Default length">
            <select
              className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus:outline-none focus:border-accent"
              value={settings.defaultLength}
              onChange={(e) => update({ defaultLength: e.target.value })}
            >
              {LENGTHS.map((l) => (<option key={l} value={l} className="bg-bg">{l}</option>))}
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
            <span className="text-[11px] uppercase tracking-wider text-white/40">Words transcribed</span>
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
              {NICHES.map((n) => (<option key={n} value={n} className="bg-bg">{n}</option>))}
            </select>
          </Field>

          <div className="flex items-center gap-4 mt-6">
            <button className="gradient-btn" onClick={handleSave}>Save</button>
            {saved && <span className="text-xs text-green-300">Saved ✓</span>}
          </div>
        </>
      )}

      {tab === 'templates' && (
        <>
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white/80">Templates</h2>
              <p className="text-[11px] text-white/40 mt-0.5">
                Reusable styles FlowWrite applies in the popup. Each has a purpose
                (Email, Post, Message…) and an optional platform — filter below.
              </p>
            </div>
            <button
              type="button"
              className="gradient-btn text-[12px] px-4 py-2 shrink-0"
              onClick={() => setEditing('new')}
            >
              + New template
            </button>
          </div>

          {/* Purpose filter pills */}
          {templates.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <FilterPill active={filterPurpose === 'All'} onClick={() => { setFilterPurpose('All'); setFilterPlatform('All'); }}>
                All
              </FilterPill>
              {purposesPresent.map((p) => (
                <FilterPill
                  key={p}
                  active={filterPurpose === p}
                  onClick={() => { setFilterPurpose(p); setFilterPlatform('All'); }}
                >
                  {p}
                </FilterPill>
              ))}

              {/* Platform sub-filter (only when relevant platforms exist) */}
              {platformsPresent.length > 0 && (
                <select
                  className="ml-auto bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[12px] focus:outline-none focus:border-accent"
                  value={filterPlatform}
                  onChange={(e) => setFilterPlatform(e.target.value)}
                >
                  <option value="All" className="bg-bg">All platforms</option>
                  {platformsPresent.map((p) => (
                    <option key={p} value={p} className="bg-bg">{p}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {templates.length === 0 ? (
            <div className="rounded-xl bg-white/[0.04] border border-white/10 p-8 text-center">
              <p className="text-white/50 text-sm">No templates yet.</p>
              <p className="text-white/30 text-xs mt-1">
                Add one and pick its purpose — e.g. an Email template “norm”, or a
                Facebook Post style.
              </p>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="rounded-xl bg-white/[0.04] border border-white/10 p-8 text-center">
              <p className="text-white/50 text-sm">No templates match this filter.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {filteredTemplates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onEdit={() => setEditing(t)}
                  onDelete={() => handleDeleteTemplate(t)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'permissions' && (
        <>
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-white/80">Permissions</h2>
            <p className="text-[11px] text-white/40 mt-0.5">
              FlowWrite needs these to work. This list re-checks itself automatically.
            </p>
          </div>

          {perms && perms.platform !== 'darwin' ? (
            <div className="rounded-xl bg-white/[0.04] border border-white/10 p-6 text-sm text-white/60">
              No extra permissions are required on this platform.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <PermRow
                title="Microphone"
                why="Needed for voice dictation (the Fn / 🎤 button)."
                ok={perms?.microphone === 'granted'}
                statusText={micStatusText(perms?.microphone)}
                actionLabel={perms?.microphone === 'not-determined' ? 'Request access' : 'Open Settings'}
                onAction={
                  perms?.microphone === 'not-determined'
                    ? async () => { await window.flowwrite?.requestMicrophone?.(); refreshPerms(); }
                    : () => window.flowwrite?.openPermissionSettings?.('microphone')
                }
              />
              <PermRow
                title="Accessibility"
                why="Lets FlowWrite paste generated & dictated text into other apps automatically. Without it, you have to press ⌘V yourself."
                ok={perms?.accessibility === true}
                statusText={perms?.accessibility ? 'Granted' : 'Not granted'}
                actionLabel="Open Settings"
                onAction={() => window.flowwrite?.openPermissionSettings?.('accessibility')}
              />

              <div className="flex items-center gap-3 mt-1">
                <button
                  type="button"
                  className="pill text-[12px]"
                  onClick={handleRecheck}
                  disabled={recheck === 'checking'}
                >
                  {recheck === 'checking' ? 'Checking…' : 'Re-check now'}
                </button>
                {recheck === 'done' && <span className="text-xs text-accentSoft">↻ Re-checked</span>}
                {recheck !== 'done' && permsOk && <span className="text-xs text-green-300">All set ✓</span>}
              </div>
              <p className="text-[11px] text-white/40 mt-1 leading-relaxed">
                After switching a permission ON in System Settings, quit and reopen
                FlowWrite so it fully takes effect. If macOS keeps re-asking for the
                microphone, toggle FlowWrite OFF then ON in
                Privacy &amp; Security → Microphone.
              </p>
            </div>
          )}
        </>
      )}

      <TemplateModal
        open={editing !== null}
        initial={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSave={saveTemplate}
      />
    </div>
  );
}

function TemplateCard({ template, onEdit, onDelete }) {
  const isEmail = template.purpose === 'Email';
  const preview = isEmail
    ? (template.signature || template.content || '')
    : (template.content || '');
  const previewLabel = isEmail ? 'Signature' : null;

  return (
    <div className="rounded-xl p-3.5 bg-white/[0.04] border border-white/10 hover:border-accent/40 transition group flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium truncate">{template.name}</span>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-accentSoft shrink-0">
              {template.purpose}
            </span>
            {template.platform && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 border border-white/15 text-white/60 shrink-0">
                {template.platform}
              </span>
            )}
          </div>
          {isEmail && template.fromName && (
            <p className="text-[11px] text-white/35 mt-0.5 truncate">from {template.fromName}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
          <button type="button" className="pill text-[10px] py-0.5 px-2" onClick={onEdit}>Edit</button>
          <button
            type="button"
            className="pill text-[10px] py-0.5 px-2 text-red-300/80 border-red-400/30"
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      </div>
      {previewLabel && (
        <span className="text-[9px] uppercase tracking-wider text-white/30 mt-1">{previewLabel}</span>
      )}
      <pre className="font-sans text-[11px] text-white/65 whitespace-pre-wrap leading-snug line-clamp-4 mt-0.5 flex-1">
        {preview || '(empty)'}
      </pre>
    </div>
  );
}

function FilterPill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'px-3 py-1 rounded-full text-[12px] border transition ' +
        (active
          ? 'bg-accent/20 border-accent/50 text-white'
          : 'bg-white/[0.04] border-white/10 text-white/55 hover:text-white')
      }
    >
      {children}
    </button>
  );
}

function micStatusText(status) {
  switch (status) {
    case 'granted': return 'Granted';
    case 'denied': return 'Denied';
    case 'restricted': return 'Restricted';
    case 'not-determined': return 'Not requested yet';
    default: return 'Unknown';
  }
}

function PermRow({ title, why, ok, statusText, actionLabel, onAction }) {
  return (
    <div className="rounded-xl p-4 bg-white/[0.04] border border-white/10 flex items-start gap-3">
      <span
        className={'mt-1 w-2.5 h-2.5 rounded-full shrink-0 ' + (ok ? 'bg-green-400' : 'bg-red-400')}
        title={ok ? 'Granted' : 'Needs attention'}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{title}</span>
          <span className={'text-[11px] ' + (ok ? 'text-green-300' : 'text-red-300')}>{statusText}</span>
        </div>
        <p className="text-[11px] text-white/45 mt-0.5 leading-relaxed">{why}</p>
      </div>
      {!ok && (
        <button type="button" className="pill text-[12px] shrink-0" onClick={onAction}>
          {actionLabel}
        </button>
      )}
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
