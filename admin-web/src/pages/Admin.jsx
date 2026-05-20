// FlowWrite Admin Panel — mobile-first responsive layout.
//
// Features per user row / card:
//   • Plan selector      (free / pro / team)
//   • Status toggle      (active / suspended)
//   • Expiry date picker (null = never)
//   • Delete button      (with confirmation)
//
// Layout:
//   Mobile  (< md): stat cards 2×2, users as stacked cards
//   Desktop (≥ md): stat cards 4×1, users in a table

import React, { useMemo, useState } from 'react';
import { signOut } from '../firebase.js';
import { useAdmin, ADMIN_UID } from '../hooks/useAdmin.js';

const PLANS = ['free', 'pro', 'team'];

const PLAN_STYLE = {
  free: 'text-white/60 border-white/20 bg-white/5',
  pro:  'text-violet-300 border-violet-400/40 bg-violet-500/10',
  team: 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10',
};

function thisMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDate(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtRelative(ms) {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 2)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return fmtDate(ms);
}

function toInputDate(ms) {
  if (!ms) return '';
  return new Date(ms).toISOString().split('T')[0]; // YYYY-MM-DD
}

function isExpired(ms) {
  return ms && ms < Date.now();
}

export default function AdminPanel({ user }) {
  const {
    users, loading, error, isAdmin,
    refresh, updatePlan, updateStatus, updateExpiry, deleteUser,
  } = useAdmin(user);

  const [search, setSearch] = useState('');
  const month = thisMonthKey();

  const stats = useMemo(() => ({
    total:  users.length,
    paid:   users.filter((u) => u.plan === 'pro' || u.plan === 'team').length,
    active: users.filter((u) => (u.usage?.[month] || 0) > 0).length,
    gens:   users.reduce((a, u) => a + (u.allTimeUsage || 0), 0),
  }), [users, month]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.email?.toLowerCase().includes(q) || u.displayName?.toLowerCase().includes(q),
    );
  }, [users, search]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="text-4xl">🔒</div>
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-white/40 text-sm">This panel is restricted to the FlowWrite admin account.</p>
        <button type="button" onClick={signOut}
          className="mt-2 px-5 py-2 rounded-xl bg-white/5 border border-white/10 text-sm hover:bg-white/10 transition">
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-bg/90 backdrop-blur border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">✨</span>
            <span className="font-semibold text-base sm:text-lg">FlowWrite Admin</span>
          </div>
          <div className="flex items-center gap-2">
            {user.photoURL && (
              <img src={user.photoURL} alt="" className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" />
            )}
            <span className="hidden sm:block text-xs text-white/40 max-w-[140px] truncate">{user.email}</span>
            <button type="button" onClick={signOut}
              className="text-xs text-white/50 hover:text-white transition px-2 py-1 rounded-lg hover:bg-white/5">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6">

        {/* Stat cards — 2 cols mobile, 4 cols desktop */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total users"       value={stats.total} />
          <StatCard label="Paid (pro/team)"   value={stats.paid}  accent />
          <StatCard label="Active this month" value={stats.active} />
          <StatCard label="All-time gens"     value={stats.gens} />
        </div>

        {/* Search + refresh */}
        <div className="flex items-center gap-2 mb-4">
          <input type="search" placeholder="Search by name or email…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm
                       placeholder-white/30 focus:outline-none focus:border-violet-400/50 transition" />
          <button type="button" onClick={refresh} title="Refresh"
            className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl
                       border border-white/10 bg-white/5 hover:bg-white/10 transition text-base">
            ↻
          </button>
        </div>

        {loading && <div className="py-16 text-center text-white/40 text-sm">Loading users…</div>}
        {error   && <div className="py-8 text-center text-red-400 text-sm">{error}</div>}

        {!loading && !error && (
          <>
            {/* Desktop table */}
            <div className="hidden md:block rounded-2xl border border-white/10 overflow-x-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-white/30 border-b border-white/10 bg-white/[0.025]">
                    <th className="text-left px-4 py-3">User</th>
                    <th className="text-left px-4 py-3">Plan</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Expires</th>
                    <th className="text-right px-4 py-3">Month</th>
                    <th className="text-right px-4 py-3">All time</th>
                    <th className="text-right px-4 py-3">Joined</th>
                    <th className="text-right px-4 py-3">Last seen</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <DesktopRow key={u.uid} user={u} month={month}
                      onPlan={(p)  => updatePlan(u.uid, p)}
                      onStatus={(s) => updateStatus(u.uid, s)}
                      onExpiry={(d) => updateExpiry(u.uid, d)}
                      onDelete={() => deleteUser(u.uid)}
                    />
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={9} className="py-12 text-center text-white/30 text-sm">
                      {search ? 'No matching users.' : 'No users yet.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden flex flex-col gap-3">
              {filtered.map((u) => (
                <MobileCard key={u.uid} user={u} month={month}
                  onPlan={(p)  => updatePlan(u.uid, p)}
                  onStatus={(s) => updateStatus(u.uid, s)}
                  onExpiry={(d) => updateExpiry(u.uid, d)}
                  onDelete={() => deleteUser(u.uid)}
                />
              ))}
              {filtered.length === 0 && (
                <div className="py-12 text-center text-white/30 text-sm">
                  {search ? 'No matching users.' : 'No users yet.'}
                </div>
              )}
            </div>

            <p className="text-xs text-white/25 mt-4 text-right">
              {filtered.length} of {users.length} user{users.length !== 1 ? 's' : ''}
            </p>
          </>
        )}
      </main>
    </div>
  );
}

// ── Desktop table row ────────────────────────────────────────────────────────

function DesktopRow({ user, month, onPlan, onStatus, onExpiry, onDelete }) {
  const [busy, setBusy] = useState(false);
  const monthUsage = user.usage?.[month] || 0;
  const suspended  = user.status === 'suspended';
  const expired    = isExpired(user.expiresAt);

  async function wrap(fn) {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  }

  async function confirmDelete() {
    if (!window.confirm(`Delete ${user.email}? This cannot be undone.`)) return;
    await wrap(onDelete);
  }

  return (
    <tr className={`border-b border-white/5 transition ${suspended ? 'opacity-50' : 'hover:bg-white/[0.02]'}`}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Avatar user={user} />
          <div className="min-w-0">
            <div className="font-medium truncate max-w-[130px]">{user.displayName || '—'}</div>
            <div className="text-[11px] text-white/40 truncate max-w-[130px]">{user.email}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <PlanSelect value={user.plan} onChange={(p) => wrap(() => onPlan(p))} busy={busy} />
      </td>
      <td className="px-4 py-3">
        <StatusToggle suspended={suspended} onChange={(s) => wrap(() => onStatus(s))} busy={busy} />
      </td>
      <td className="px-4 py-3">
        <ExpiryPicker value={user.expiresAt} expired={expired} onChange={(d) => wrap(() => onExpiry(d))} busy={busy} />
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-white/70">
        {monthUsage}{user.plan === 'free' && <span className="text-white/30 text-[10px]">/30</span>}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-white/70">{user.allTimeUsage || 0}</td>
      <td className="px-4 py-3 text-right text-white/40 text-xs">{fmtDate(user.createdAt)}</td>
      <td className="px-4 py-3 text-right text-white/40 text-xs">{fmtRelative(user.lastSeen)}</td>
      <td className="px-4 py-3 text-right">
        <button type="button" onClick={confirmDelete} disabled={busy}
          className="text-[11px] text-red-400/70 hover:text-red-400 border border-red-400/20
                     hover:border-red-400/40 rounded-lg px-2.5 py-1 transition disabled:opacity-40">
          Delete
        </button>
      </td>
    </tr>
  );
}

// ── Mobile card ──────────────────────────────────────────────────────────────

function MobileCard({ user, month, onPlan, onStatus, onExpiry, onDelete }) {
  const [busy, setBusy] = useState(false);
  const [showExpiry, setShowExpiry] = useState(false);
  const monthUsage = user.usage?.[month] || 0;
  const suspended  = user.status === 'suspended';
  const expired    = isExpired(user.expiresAt);

  async function wrap(fn) {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  }

  async function confirmDelete() {
    if (!window.confirm(`Delete ${user.email}?\nThis cannot be undone.`)) return;
    await wrap(onDelete);
  }

  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition ${suspended ? 'opacity-60' : ''}`}>
      {/* Top row: avatar + identity + status badge */}
      <div className="flex items-start gap-3 mb-3">
        <Avatar user={user} size="md" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{user.displayName || '—'}</div>
          <div className="text-xs text-white/40 truncate">{user.email}</div>
          {suspended && (
            <span className="inline-block mt-0.5 text-[10px] text-red-400 bg-red-500/10 border border-red-400/30 rounded-full px-2 py-0.5">
              Suspended
            </span>
          )}
          {expired && !suspended && (
            <span className="inline-block mt-0.5 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-400/30 rounded-full px-2 py-0.5">
              Expired
            </span>
          )}
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <PlanSelect value={user.plan} onChange={(p) => wrap(() => onPlan(p))} busy={busy} />
        <StatusToggle suspended={suspended} onChange={(s) => wrap(() => onStatus(s))} busy={busy} />
        <button type="button" onClick={() => setShowExpiry((v) => !v)}
          className="text-[11px] text-white/50 border border-white/15 rounded-full px-2.5 py-1 hover:border-white/30 transition">
          {user.expiresAt ? `Expires ${fmtDate(user.expiresAt)}` : '+ Set expiry'}
        </button>
      </div>

      {showExpiry && (
        <div className="mb-3">
          <ExpiryPicker value={user.expiresAt} expired={expired} onChange={(d) => wrap(() => onExpiry(d))} busy={busy} full />
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/5">
        <MiniStat label="This month" value={`${monthUsage}${user.plan === 'free' ? '/30' : ''}`} />
        <MiniStat label="All time"   value={user.allTimeUsage || 0} />
        <MiniStat label="Joined"     value={fmtDate(user.createdAt)} />
        <MiniStat label="Last seen"  value={fmtRelative(user.lastSeen)} />
      </div>

      {/* Delete */}
      <button type="button" onClick={confirmDelete} disabled={busy}
        className="mt-3 w-full text-center text-xs text-red-400/60 hover:text-red-400
                   border border-red-400/15 hover:border-red-400/30 rounded-xl py-2 transition
                   disabled:opacity-40">
        Delete user
      </button>
    </div>
  );
}

// ── Shared controls ──────────────────────────────────────────────────────────

function PlanSelect({ value, onChange, busy }) {
  return (
    <select value={value || 'free'} onChange={(e) => onChange(e.target.value)} disabled={busy}
      className={`text-xs font-semibold rounded-full px-3 py-1.5 border cursor-pointer
                  bg-transparent focus:outline-none transition
                  ${PLAN_STYLE[value] || PLAN_STYLE.free}
                  ${busy ? 'opacity-50 cursor-not-allowed' : ''}`}>
      {PLANS.map((p) => (
        <option key={p} value={p} className="bg-[#0f0f1a] text-white">
          {p.charAt(0).toUpperCase() + p.slice(1)}
        </option>
      ))}
    </select>
  );
}

function StatusToggle({ suspended, onChange, busy }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onChange(suspended ? 'active' : 'suspended')}
      title={suspended ? 'Click to activate' : 'Click to suspend'}
      className={`text-[11px] font-medium rounded-full px-2.5 py-1 border transition
                  ${busy ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  ${suspended
                    ? 'text-red-400 border-red-400/40 bg-red-500/10 hover:bg-red-500/20'
                    : 'text-emerald-400 border-emerald-400/40 bg-emerald-500/10 hover:bg-emerald-500/20'}`}
    >
      {suspended ? '✕ Suspended' : '✓ Active'}
    </button>
  );
}

function ExpiryPicker({ value, expired, onChange, busy, full }) {
  return (
    <div className={`flex items-center gap-1.5 ${full ? 'w-full' : ''}`}>
      <input
        type="date"
        value={toInputDate(value)}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={busy}
        className={`bg-white/5 border rounded-lg px-2 py-1 text-xs text-white/80
                    focus:outline-none focus:border-violet-400/50 transition
                    disabled:opacity-50 ${full ? 'flex-1' : 'w-36'}
                    ${expired ? 'border-amber-400/40 text-amber-300' : 'border-white/15'}`}
      />
      {value && (
        <button type="button" onClick={() => onChange(null)} disabled={busy}
          title="Clear expiry"
          className="text-white/30 hover:text-white/70 text-xs transition disabled:opacity-40">
          ✕
        </button>
      )}
    </div>
  );
}

function Avatar({ user, size }) {
  const cls = size === 'md'
    ? 'w-10 h-10 rounded-full shrink-0 text-sm font-semibold'
    : 'w-7 h-7 rounded-full shrink-0 text-xs font-semibold';
  if (user.photoURL) {
    return <img src={user.photoURL} alt="" className={cls} referrerPolicy="no-referrer" />;
  }
  return (
    <div className={`${cls} bg-white/10 flex items-center justify-center`}>
      {(user.displayName || user.email || '?')[0].toUpperCase()}
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">{label}</div>
      <div className="text-sm font-medium text-white/80">{value}</div>
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className={`rounded-2xl p-4 border ${accent ? 'bg-violet-500/10 border-violet-400/30' : 'bg-white/[0.04] border-white/10'}`}>
      <div className="text-2xl sm:text-3xl font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/40 mt-1 leading-tight">{label}</div>
    </div>
  );
}
