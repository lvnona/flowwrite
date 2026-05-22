// Dashboard page — at-a-glance usage stats only.
//
// Popup requests (this week / month / all-time) come from the cloud profile;
// transcribed-word counts come from the main process. Template management lives
// in Settings → Templates.

import React, { useEffect, useMemo, useState } from 'react';
import { useHistory } from '../hooks/useHistory.js';
import { useAuth } from '../hooks/useAuth.js';
import { thisWeekKey } from '../utils/usageTracking.js';
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
  const { profile } = useAuth();

  // Transcriber word counts come from the main process (electron-store), which
  // counts EVERY dictation source regardless of auth — see main.js.
  const [transcriber, setTranscriber] = useState({ words: 0, weekly: {}, monthly: {} });
  const [version, setVersion] = useState('');

  useEffect(() => {
    window.flowwrite?.getTranscriberStats?.().then((s) => {
      if (s) setTranscriber({ words: 0, weekly: {}, monthly: {}, ...s });
    });
    window.flowwrite?.getAppVersion?.().then((v) => { if (v) setVersion(v); });
  }, []);

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

  // Voice-dictation words: this week / this month / all-time.
  const words = useMemo(() => ({
    week:  transcriber?.weekly?.[thisWeekKey()] || 0,
    month: transcriber?.monthly?.[thisMonthKey()] || 0,
    all:   transcriber?.words || 0,
  }), [transcriber]);

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

      {/* Popup requests — cloud-side counters are authoritative */}
      <h3 className="text-[11px] uppercase tracking-wider text-white/40 mb-2">
        Popup requests
      </h3>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatCard label="This week" value={cloudUsage.weekly} accent />
        <StatCard
          label={`This month (${cloudUsage.plan})`}
          value={cloudUsage.monthly}
          secondary={cloudUsage.limit ? `of ${cloudUsage.limit}` : 'unlimited'}
        />
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
