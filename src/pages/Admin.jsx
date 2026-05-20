// Admin panel — visible only to the hardcoded admin UID.
//
// Shows all registered users with their plan, usage stats, and sign-up dates.
// The admin can upgrade / downgrade any user's plan inline.

import React, { useMemo, useState } from 'react';
import NavBar from '../components/NavBar.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useAdmin } from '../hooks/useAdmin.js';

const PLANS = ['free', 'pro', 'team'];

const PLAN_COLORS = {
  free: 'text-white/50 border-white/20 bg-white/5',
  pro:  'text-accent border-accent/40 bg-accent/10',
  team: 'text-purple-300 border-purple-400/40 bg-purple-500/10',
};

function thisMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDate(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
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

export default function Admin() {
  const { user } = useAuth();
  const { users, loading, error, isAdmin, refresh, updatePlan } = useAdmin(user);
  const month = thisMonthKey();

  const stats = useMemo(() => {
    const total     = users.length;
    const pro       = users.filter((u) => u.plan === 'pro' || u.plan === 'team').length;
    const activeThisMonth = users.filter((u) => (u.usage?.[month] || 0) > 0).length;
    const totalGens = users.reduce((acc, u) => acc + (u.allTimeUsage || 0), 0);
    return { total, pro, activeThisMonth, totalGens };
  }, [users, month]);

  if (!isAdmin) {
    return (
      <div className="page-bg p-8 flex items-center justify-center text-white/50">
        Access denied.
      </div>
    );
  }

  return (
    <div className="page-bg p-8 max-w-5xl mx-auto text-white">
      <NavBar active="admin" />

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="Total users"      value={stats.total} />
        <StatCard label="Paid (pro/team)"  value={stats.pro}   accent />
        <StatCard label="Active this month" value={stats.activeThisMonth} />
        <StatCard label="All-time generations" value={stats.totalGens} />
      </div>

      {/* User table */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.03]">
          <h2 className="text-sm font-semibold">Users</h2>
          <button
            type="button"
            onClick={refresh}
            className="pill text-[11px] py-0.5 px-3"
          >
            ↻ Refresh
          </button>
        </div>

        {loading && (
          <div className="p-8 text-center text-white/40 text-sm">Loading…</div>
        )}
        {error && (
          <div className="p-8 text-center text-red-400 text-sm">{error}</div>
        )}

        {!loading && !error && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-white/30 border-b border-white/10">
                <th className="text-left px-4 py-2">User</th>
                <th className="text-left px-4 py-2">Plan</th>
                <th className="text-right px-4 py-2">This month</th>
                <th className="text-right px-4 py-2">All time</th>
                <th className="text-right px-4 py-2">Signed up</th>
                <th className="text-right px-4 py-2">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow
                  key={u.uid}
                  user={u}
                  month={month}
                  onPlanChange={(plan) => updatePlan(u.uid, plan)}
                />
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-white/30 text-sm">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function UserRow({ user, month, onPlanChange }) {
  const [saving, setSaving] = useState(false);
  const monthUsage = user.usage?.[month] || 0;

  async function handlePlan(e) {
    const plan = e.target.value;
    if (plan === user.plan) return;
    setSaving(true);
    try {
      await onPlanChange(plan);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-b border-white/5 hover:bg-white/[0.02] transition">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt=""
              className="w-7 h-7 rounded-full shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-white/10 shrink-0 flex items-center justify-center text-xs">
              {(user.displayName || user.email || '?')[0].toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-medium truncate max-w-[180px]">
              {user.displayName || '—'}
            </div>
            <div className="text-[11px] text-white/40 truncate max-w-[180px]">
              {user.email}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <select
          value={user.plan || 'free'}
          onChange={handlePlan}
          disabled={saving}
          className={
            'text-[11px] font-medium rounded-full px-2.5 py-1 border cursor-pointer ' +
            'bg-transparent focus:outline-none focus:ring-1 focus:ring-accent/50 ' +
            (PLAN_COLORS[user.plan] || PLAN_COLORS.free) +
            (saving ? ' opacity-50' : '')
          }
        >
          {PLANS.map((p) => (
            <option key={p} value={p} className="bg-[#1a1a2e] text-white">
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-white/70">
        {monthUsage}
        {user.plan === 'free' && (
          <span className="text-white/30 ml-1 text-[10px]">/30</span>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-white/70">
        {user.allTimeUsage || 0}
      </td>
      <td className="px-4 py-3 text-right text-white/40 text-[12px]">
        {fmtDate(user.createdAt)}
      </td>
      <td className="px-4 py-3 text-right text-white/40 text-[12px]">
        {fmtRelative(user.lastSeen)}
      </td>
    </tr>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div
      className={
        'rounded-xl p-4 border ' +
        (accent
          ? 'bg-accent/15 border-accent/40'
          : 'bg-white/[0.04] border-white/10')
      }
    >
      <div className="text-3xl font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-white/40 mt-1">
        {label}
      </div>
    </div>
  );
}
