// History page — last 50 generations stored in electron-store.
// Click "Copy" to put any past output back on the clipboard.

import React, { useEffect, useMemo, useState } from 'react';
import { useHistory } from '../hooks/useHistory.js';
import NavBar from '../components/NavBar.jsx';

function relTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60)        return `${s}s ago`;
  if (s < 3600)      return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)     return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function History() {
  const { entries, clear, refresh } = useHistory();
  const [historyOn, setHistoryOn] = useState(null); // null=loading

  useEffect(() => {
    window.flowwrite?.getSettings?.().then((s) => setHistoryOn(s?.historyEnabled === true));
  }, []);

  async function enableHistory() {
    await window.flowwrite?.saveSettings?.({ historyEnabled: true });
    setHistoryOn(true);
  }

  const grouped = useMemo(() => {
    // Group by day for a more readable feed.
    const buckets = new Map();
    for (const e of entries) {
      const day = new Date(e.timestamp || 0).toLocaleDateString();
      if (!buckets.has(day)) buckets.set(day, []);
      buckets.get(day).push(e);
    }
    return [...buckets.entries()];
  }, [entries]);

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); } catch {}
  }

  return (
    <div className="page-bg p-8 max-w-3xl mx-auto text-white">
      <NavBar active="history" />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">History</h1>
          <p className="text-xs text-white/40 mt-1">
            Last {entries.length} generation{entries.length === 1 ? '' : 's'} · stored locally on this Mac
          </p>
        </div>
        <div className="flex gap-2">
          <button className="pill" onClick={refresh}>Refresh</button>
          <button className="pill" onClick={clear}>Clear all</button>
        </div>
      </div>

      {historyOn === false && (
        <div className="rounded-xl bg-accent/10 border border-accent/30 p-4 mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-medium">History is turned off for privacy</p>
            <p className="text-[12px] text-white/50 mt-0.5">
              New generations aren't being saved. Turn it on if you'd like a local record.
            </p>
          </div>
          <button className="gradient-btn text-[12px] px-4 py-2 shrink-0" onClick={enableHistory}>
            Enable history
          </button>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="rounded-xl bg-white/[0.04] border border-white/10 p-8 text-center">
          <p className="text-white/50 text-sm">No generations yet.</p>
          <p className="text-white/30 text-xs mt-1">
            Press <kbd className="kbd">⌘ ⇧ W</kbd> in any text field to get started.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map(([day, items]) => (
            <section key={day}>
              <h2 className="text-[10px] uppercase tracking-wider text-white/30 mb-2">{day}</h2>
              <ul className="flex flex-col gap-2">
                {items.map((e, i) => (
                  <li
                    key={`${day}-${i}`}
                    className="bg-white/[0.04] border border-white/10 rounded-lg p-3 hover:bg-white/[0.07] transition"
                  >
                    <div className="flex items-center justify-between text-[11px] text-white/40 mb-1.5 gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {e.app && <Badge>{e.app}</Badge>}
                        {e.contentType && <Badge>{e.contentType}</Badge>}
                        {e.tone && <Badge accent>{e.tone}</Badge>}
                      </div>
                      <span className="shrink-0">{relTime(e.timestamp)}</span>
                    </div>
                    <p className="text-sm text-white/85 leading-relaxed">
                      {(e.text || '').slice(0, 240)}
                      {(e.text || '').length > 240 ? '…' : ''}
                    </p>
                    <div className="flex justify-end mt-2">
                      <button
                        className="pill text-[11px]"
                        onClick={() => copy(e.text)}
                      >
                        Copy
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Badge({ children, accent }) {
  return (
    <span
      className={
        'px-2 py-0.5 rounded-full border text-[10px] ' +
        (accent
          ? 'bg-accent/15 border-accent/30 text-accentSoft'
          : 'bg-white/[0.04] border-white/10 text-white/60')
      }
    >
      {children}
    </span>
  );
}
