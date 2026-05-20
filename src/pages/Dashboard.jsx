// Dashboard page — at-a-glance usage stats + USER-DEFINED style examples.
//
// A "user template" / "example" is a complete example post the user has
// authored. FlowWrite uses it as a few-shot reference when generating: the
// AI matches its tone, structure, emoji + hashtag pattern, and voice.
//
// Each example has:
//   - name (required)
//   - platform (optional) — used to auto-select this example when the popup
//     detects you're on that app
//   - content (required) — the full example text
//   - notes (optional) — personal reminder, never sent to the model

import React, { useMemo, useState } from 'react';
import { useHistory } from '../hooks/useHistory.js';
import { useUserTemplates } from '../hooks/useUserTemplates.js';
import { useAuth } from '../hooks/useAuth.js';
import NavBar from '../components/NavBar.jsx';
import UserTemplateModal from '../components/UserTemplateModal.jsx';

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
  const { templates, save, remove } = useUserTemplates();
  const { profile } = useAuth();

  const [editing, setEditing] = useState(null); // null | 'new' | template object

  // Cloud-side counters are the source of truth (server enforces them). The
  // local history list is a richer log of what was actually generated.
  const cloudUsage = useMemo(() => {
    const monthly = profile?.usage?.[thisMonthKey()] || 0;
    const allTime = profile?.allTimeUsage || 0;
    const plan = profile?.plan || 'free';
    const limit = plan === 'free' ? 30 : null;
    return { monthly, allTime, plan, limit };
  }, [profile]);

  const stats = useMemo(() => {
    const now = Date.now();
    const today = startOfDay(now);
    return {
      today:    entries.filter((e) => (e.timestamp || 0) >= today).length,
      byApp:    topCount(entries, 'app').slice(0, 5),
      byTone:   topCount(entries, 'tone').slice(0, 1)[0] || null,
    };
  }, [entries]);

  async function handleDelete(t) {
    if (!confirm(`Delete "${t.name}"? This cannot be undone.`)) return;
    await remove(t.id);
  }

  return (
    <div className="page-bg p-8 max-w-4xl mx-auto text-white">
      <NavBar active="dashboard" />

      {/* Headline stat cards — cloud-side counters are authoritative */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard
          label={`This month (${cloudUsage.plan})`}
          value={cloudUsage.monthly}
          secondary={cloudUsage.limit ? `of ${cloudUsage.limit}` : 'unlimited'}
          accent
        />
        <StatCard label="All time" value={cloudUsage.allTime} />
        <StatCard label="Today" value={stats.today} />
      </div>

      {/* My examples */}
      <section className="mb-6">
        <div className="flex items-end justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">My examples</h2>
            <p className="text-[11px] text-white/40 mt-0.5">
              Paste full example posts in the style you want. FlowWrite will
              match their tone, structure, emojis &amp; hashtag pattern when
              generating on the matching platform.
            </p>
          </div>
          <button
            type="button"
            className="gradient-btn text-[12px] px-4 py-2"
            onClick={() => setEditing('new')}
          >
            + New example
          </button>
        </div>

        {templates.length === 0 ? (
          <div className="rounded-xl bg-white/[0.04] border border-white/10 p-8 text-center">
            <p className="text-white/50 text-sm">No examples yet.</p>
            <p className="text-white/30 text-xs mt-1">
              Add your first one to teach FlowWrite your style.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {templates.map((t) => (
              <ExampleCard
                key={t.id}
                template={t}
                onEdit={() => setEditing(t)}
                onDelete={() => handleDelete(t)}
              />
            ))}
          </div>
        )}
      </section>

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
          <li>Add an example for the platforms you write on (Facebook, Instagram, etc.) — paste a post you'd be proud to publish.</li>
          <li>Click into any text field. Press <kbd className="kbd">⌘ ⇧ W</kbd> to summon the popup.</li>
          <li>FlowWrite auto-picks the matching example. Type your topic, pick tone, click <span className="text-accent">✨ Generate</span>.</li>
          <li>Hit <span className="text-accent">✓ Insert</span> — it auto-pastes into the field you were just in.</li>
        </ol>
      </Panel>

      <UserTemplateModal
        open={editing !== null}
        initial={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSave={save}
      />
    </div>
  );
}

function ExampleCard({ template, onEdit, onDelete }) {
  const preview = (template.content || '').split('\n').slice(0, 4).join('\n');
  const charCount = (template.content || '').length;
  const wordCount = (template.content || '').split(/\s+/).filter(Boolean).length;
  const hashtagCount = (template.content?.match(/#\w+/g) || []).length;

  return (
    <div className="rounded-xl p-3.5 bg-white/[0.04] border border-white/10 hover:border-accent/40 transition group flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{template.name}</span>
            {template.platform && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-accentSoft shrink-0">
                {template.platform}
              </span>
            )}
          </div>
          {template.notes && (
            <p className="text-[11px] text-white/35 mt-0.5 truncate">{template.notes}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
          <button
            type="button"
            className="pill text-[10px] py-0.5 px-2"
            onClick={onEdit}
            title="Edit"
          >
            Edit
          </button>
          <button
            type="button"
            className="pill text-[10px] py-0.5 px-2 text-red-300/80 border-red-400/30"
            onClick={onDelete}
            title="Delete"
          >
            Delete
          </button>
        </div>
      </div>
      <pre className="font-sans text-[11px] text-white/65 whitespace-pre-wrap leading-snug line-clamp-4 mt-1 mb-2 flex-1">
        {preview || '(empty)'}
      </pre>
      <div className="flex items-center gap-3 text-[10px] text-white/35 mt-auto">
        <span>{wordCount} words</span>
        <span>·</span>
        <span>{charCount} chars</span>
        {hashtagCount > 0 && (
          <>
            <span>·</span>
            <span>{hashtagCount} #</span>
          </>
        )}
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
        <span className="text-3xl font-semibold tabular-nums">{value}</span>
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
