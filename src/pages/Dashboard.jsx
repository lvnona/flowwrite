// Dashboard page — at-a-glance usage stats only.
//
// Popup requests (this week / month / all-time) come from the cloud profile;
// transcribed-word counts come from the main process. Template management lives
// in Settings → Templates.

import React, { useEffect, useMemo, useState } from 'react';
import { useHistory } from '../hooks/useHistory.js';
import { useAuth } from '../hooks/useAuth.js';
import { thisWeekKey } from '../utils/usageTracking.js';
import { checkoutUrl, portalUrl } from '../utils/billing.js';
import NavBar from '../components/NavBar.jsx';

function startOfDay(t = Date.now()) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function topCount(arr, key) {
  const counts = new Map();
  for (const item of arr) {
    const k = item?.[key] || 'Unknown';
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function thisMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Dashboard() {
  const { entries } = useHistory();
  const { user, profile } = useAuth();

  const [version, setVersion] = useState('');

  useEffect(() => {
    window.flowwrite?.getAppVersion?.().then((v) => { if (v) setVersion(v); });
  }, []);

  const isPro = (profile?.plan === 'pro' || profile?.plan === 'team');

  // Per-account usage this week (cloud) — matches what the limits enforce.
  const limitUsage = useMemo(() => ({
    generations: profile?.usageWeekly?.[thisWeekKey()] || 0,
    audioWords: profile?.audioWordsWeekly?.[thisWeekKey()] || 0,
  }), [profile]);

  function openUpgrade() {
    window.flowwrite?.openExternal?.(checkoutUrl(user?.uid, user?.email));
  }
  function openManage() {
    window.flowwrite?.openExternal?.(portalUrl(user?.uid));
  }

  // Cloud-side counters are the source of truth (server enforces them). The
  // local history list is a richer log of what was actually generated.
  const cloudUsage = useMemo(() => {
    const monthly = profile?.usage?.[thisMonthKey()] || 0;
    const weekly = profile?.usageWeekly?.[thisWeekKey()] || 0;
    const allTime = profile?.allTimeUsage || 0;
    const plan = profile?.plan || 'free';
    const limit = plan === 'free' ? 30 : null;
    return { monthly, weekly, allTime, plan, limit };
  }, [profile]);

  // Voice-dictation words — PER-ACCOUNT (cloud), so it matches the plan-panel
  // figure and is the same total on every device.
  const words = useMemo(() => ({
    week:  profile?.audioWordsWeekly?.[thisWeekKey()] || 0,
    month: profile?.audioWords?.[thisMonthKey()] || 0,
    all:   profile?.allTimeAudioWords || 0,
  }), [profile]);

  const stats = useMemo(() => {
    const now = Date.now();
    const today = startOfDay(now);
    return {
      today:    entries.filter((e) => (e.timestamp || 0) >= today).length,
      byApp:    topCount(entries, 'app').slice(0, 5),
      byTone:   topCount(entries, 'tone').slice(0, 1)[0] || null,
    };
  }, [entries]);

  return (
    <div className="page-bg p-8 max-w-4xl mx-auto text-white">
      <NavBar active="dashboard" />

      {/* ── Plan & limits ─────────────────────────────────────────────── */}
      <div className={'rounded-xl p-5 mb-6 border ' + (isPro ? 'bg-accent/10 border-accent/40' : 'bg-white/[0.04] border-white/10')}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Your plan</span>
              <span className={'text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full ' + (isPro ? 'bg-accent text-white' : 'bg-white/10 text-white/70')}>
                {isPro ? (profile?.plan === 'team' ? 'Team' : 'Pro') : 'Free'}
              </span>
            </div>
            <p className="text-[12px] text-white/45 mt-1">
              {isPro
                ? 'Unlimited generations & voice dictation.'
                : 'Free weekly limits — they reset every Monday.'}
            </p>
          </div>
          {isPro ? (
            <button type="button" className="pill text-[12px]" onClick={openManage}>Manage subscription</button>
          ) : (
            <button type="button" className="gradient-btn text-[12px] px-4 py-2" onClick={openUpgrade}>Upgrade to Pro</button>
          )}
        </div>

        {!isPro && (
          <div className="grid grid-cols-2 gap-4 mt-4">
            <UsageBar label="AI generations" used={limitUsage.generations} limit={50} />
            <UsageBar label="Dictated words" used={limitUsage.audioWords} limit={2500} />
          </div>
        )}
      </div>

      {/* Popup requests — cloud-side counters are authoritative */}
      <h3 className="text-[11px] uppercase tracking-wider text-white/40 mb-2">
        Popup requests
      </h3>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatCard
          label="This week"
          value={cloudUsage.weekly}
          secondary={isPro ? 'unlimited' : 'of 50'}
          accent
        />
        <StatCard label={`This month (${cloudUsage.plan})`} value={cloudUsage.monthly} />
        <StatCard label="All time" value={cloudUsage.allTime} />
      </div>

      {/* Voice dictation — words transcribed */}
      <h3 className="text-[11px] uppercase tracking-wider text-white/40 mb-2">
        Words transcribed (voice)
      </h3>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="This week" value={words.week} accent />
        <StatCard label="This month" value={words.month} />
        <StatCard label="All time" value={words.all} />
      </div>

      {/* Side-by-side: top apps + favourite tone */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Panel title="Where you use FlowWrite">
          {stats.byApp.length === 0 ? (
            <Empty>No activity yet.</Empty>
          ) : (
            <ul className="flex flex-col gap-2 mt-2">
              {stats.byApp.map(([app, count]) => (
                <li key={app} className="flex items-center justify-between text-sm">
                  <span className="text-white/80 truncate pr-2">{app}</span>
                  <span className="text-white/40 tabular-nums">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Favourite tone">
          {stats.byTone ? (
            <div className="mt-2">
              <div className="text-2xl font-semibold">{stats.byTone[0]}</div>
              <div className="text-xs text-white/40 mt-1">
                Used {stats.byTone[1]} time{stats.byTone[1] === 1 ? '' : 's'}
              </div>
            </div>
          ) : (
            <Empty>No tone preference yet — try a few!</Empty>
          )}
        </Panel>
      </div>

      <Panel title="Quick start">
        <ol className="text-sm text-white/70 leading-relaxed mt-2 list-decimal list-inside space-y-1">
          <li>Open <span className="text-accent">Settings → Templates</span> and add templates for what you write (an Email template with your signature, a Facebook Post style, etc.).</li>
          <li>Click into any text field. Press <kbd className="kbd">⌘ ⇧ W</kbd> to summon the popup.</li>
          <li>FlowWrite auto-picks the matching template. Type your topic, pick tone, click <span className="text-accent">✨ Generate</span>.</li>
          <li>Hit <span className="text-accent">✓ Insert</span> — it auto-pastes into the field you were just in.</li>
        </ol>
      </Panel>

      <footer className="mt-8 pt-5 border-t border-white/10 flex items-center justify-center gap-2 text-[11px] text-white/35">
        <span className="font-medium text-white/50">FlowWrite</span>
        {version && <span className="tabular-nums">v{version}</span>}
        <span>·</span>
        <span>Developed by U11</span>
      </footer>
    </div>
  );
}

function UsageBar({ label, used, limit }) {
  const lim = limit || 0;
  const pct = lim > 0 ? Math.min(100, Math.round((used / lim) * 100)) : 0;
  const over = lim > 0 && used >= lim;
  return (
    <div>
      <div className="flex items-center justify-between text-[12px] mb-1.5">
        <span className="text-white/70">{label}</span>
        <span className={'tabular-nums ' + (over ? 'text-red-300' : 'text-white/50')}>
          {used.toLocaleString()} / {lim.toLocaleString()}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className={'h-full rounded-full ' + (over ? 'bg-red-400' : 'bg-accent')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value, secondary, accent }) {
  return (
    <div
      className={
        'rounded-xl p-4 border ' +
        (accent
          ? 'bg-accent/15 border-accent/40'
          : 'bg-white/[0.04] border-white/10')
      }
    >
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tabular-nums">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {secondary && (
          <span className="text-xs text-white/40">{secondary}</span>
        )}
      </div>
      <div className="text-[11px] uppercase tracking-wider text-white/40 mt-1">{label}</div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="rounded-xl p-4 bg-white/[0.04] border border-white/10">
      <h3 className="text-[11px] uppercase tracking-wider text-white/40">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <div className="text-xs text-white/40 mt-2">{children}</div>;
}
