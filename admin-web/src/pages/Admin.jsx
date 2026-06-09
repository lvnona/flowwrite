// FlowWrite Admin Panel — two tabs: Users and API Keys.
//
// Users tab
//   • Stat cards  (total, paid, active this month, all-time gens)
//   • User table  (plan, status, expiry, week / month popup requests,
//                  audio words this month, estimated API cost, joined, last seen)
//   • Sent invites with Resend + Delete
//
// API Keys tab
//   • Anthropic + OpenAI key editor (stored in Firestore config/apiKeys)

import React, { useEffect, useMemo, useState } from 'react';
import { signOut } from '../firebase.js';
import { useAdmin, ADMIN_UID } from '../hooks/useAdmin.js';

// ── Cost constants (edit to keep in sync with actual API pricing) ─────────────
// Claude Opus  ≈ $15/MTok in + $75/MTok out; ~500 in + 300 out per popup request
const COST_PER_POPUP      = 0.030;   // $ per popup generation
// OpenAI Whisper $0.006/min; gpt-4o-mini polish ~$0.0001/request
const COST_PER_AUDIO_WORD = 0.000045; // $ per transcribed word

const PLANS = ['free', 'pro', 'team'];
const PLAN_STYLE = {
  free: 'text-white/60 border-white/20 bg-white/5',
  pro:  'text-violet-300 border-violet-400/40 bg-violet-500/10',
  team: 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10',
};

// ── Date helpers ──────────────────────────────────────────────────────────────

function thisMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function thisWeekKey() {
  const d = new Date();
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86_400_000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
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
  return new Date(ms).toISOString().split('T')[0];
}

function isExpired(ms) { return ms && ms < Date.now(); }

function fmtCost(n) {
  if (!n) return '$0.00';
  if (n < 0.005) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

// Stripe stores current_period_end as UNIX seconds. Anything before 2010 is
// almost certainly a sentinel / uninitialised value (Unix epoch 0 → 1 Jan 1970),
// so render those as "—" rather than misleading the admin.
function fmtPeriodEnd(sec) {
  if (!sec || sec < 1262304000) return '—'; // 2010-01-01
  return fmtDate(sec * 1000);
}

const SUB_STATUS_STYLE = {
  active:   'text-emerald-300 border-emerald-400/40 bg-emerald-500/10',
  trialing: 'text-sky-300 border-sky-400/40 bg-sky-500/10',
  past_due: 'text-amber-300 border-amber-400/40 bg-amber-500/10',
  canceled: 'text-red-300 border-red-400/40 bg-red-500/10',
  unpaid:   'text-red-300 border-red-400/40 bg-red-500/10',
};

// ── Root component ────────────────────────────────────────────────────────────

export default function AdminPanel({ user }) {
  const {
    users, invites, loading, error, isAdmin, isSuperAdmin, adminResolved,
    adminUids, addAdmin, removeAdmin,
    refresh, inviteUser, resendInvite, deleteInvite,
    updatePlan, updateStatus, updateExpiry, deleteUser,
    resetFreeWeeklyUsage, resyncStripe,
    apiKeys, saveApiKeys,
    billing, saveBilling,
    limits, saveLimits,
  } = useAdmin(user);

  const [tab, setTab]           = useState('users'); // 'users' | 'subscribers' | 'apikeys' | 'config'
  const [search, setSearch]     = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const month = thisMonthKey();
  const week  = thisWeekKey();

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

  // Still determining whether this account is an admin (config/admins read).
  if (!adminResolved) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/40 text-sm">
        Checking access…
      </div>
    );
  }

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
          <div className="flex items-center gap-3">
            <span className="text-xl">✨</span>
            <span className="font-semibold text-base sm:text-lg">FlowWrite Admin</span>

            {/* Tabs */}
            <div className="hidden sm:flex items-center ml-4 bg-white/5 border border-white/10 rounded-xl p-1 gap-1">
              <TabBtn active={tab === 'users'}       onClick={() => setTab('users')}>Users</TabBtn>
              <TabBtn active={tab === 'subscribers'} onClick={() => setTab('subscribers')}>Subscribers</TabBtn>
              <TabBtn active={tab === 'apikeys'}     onClick={() => setTab('apikeys')}>API Keys</TabBtn>
              <TabBtn active={tab === 'config'}      onClick={() => setTab('config')}>Config</TabBtn>
            </div>
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

        {/* Mobile tabs */}
        <div className="sm:hidden flex gap-1 mt-2 bg-white/5 border border-white/10 rounded-xl p-1">
          <TabBtn active={tab === 'users'}       onClick={() => setTab('users')}>Users</TabBtn>
          <TabBtn active={tab === 'subscribers'} onClick={() => setTab('subscribers')}>Subs</TabBtn>
          <TabBtn active={tab === 'apikeys'}     onClick={() => setTab('apikeys')}>Keys</TabBtn>
          <TabBtn active={tab === 'config'}      onClick={() => setTab('config')}>Config</TabBtn>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6">

        {/* ── USERS TAB ─────────────────────────────────────────────────── */}
        {tab === 'users' && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatCard label="Total users"       value={stats.total} />
              <StatCard label="Paid (pro/team)"   value={stats.paid}  accent />
              <StatCard label="Active this month" value={stats.active} />
              <StatCard label="All-time gens"     value={stats.gens} />
            </div>

            {/* Search + invite + refresh */}
            <div className="flex items-center gap-2 mb-4">
              <input type="search" placeholder="Search by name or email…"
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm
                           placeholder-white/30 focus:outline-none focus:border-violet-400/50 transition" />
              <button type="button" onClick={() => setShowInvite(true)}
                className="shrink-0 h-10 px-3.5 flex items-center gap-1.5 rounded-xl
                           bg-violet-500/90 hover:bg-violet-500 text-white text-sm font-medium transition">
                <span className="text-base leading-none">+</span>
                <span className="hidden sm:inline">Invite</span>
              </button>
              <ResetFreeButton onReset={resetFreeWeeklyUsage} />
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
                  <table className="w-full text-sm" style={{ minWidth: 1050 }}>
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-white/30 border-b border-white/10 bg-white/[0.025]">
                        <th className="text-left px-4 py-3">User</th>
                        <th className="text-left px-4 py-3">Plan</th>
                        <th className="text-left px-4 py-3">Status</th>
                        <th className="text-left px-4 py-3" title="Admin-only override (comped / team grants). Stripe renewals shown in Subscribers tab.">Manual expiry</th>
                        <th className="text-right px-3 py-3" title="Popup generations this week">Gens / wk</th>
                        <th className="text-right px-3 py-3" title="Dictated words this week">Audio / wk</th>
                        <th className="text-right px-3 py-3" title="Popup generations all time">Gens all-time</th>
                        <th className="text-right px-3 py-3" title="Dictated words all time">Audio all-time</th>
                        <th className="text-right px-4 py-3">Joined</th>
                        <th className="text-right px-4 py-3">Last seen</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((u) => (
                        <DesktopRow key={u.uid} user={u} month={month} week={week}
                          onPlan={(p)   => updatePlan(u.uid, p)}
                          onStatus={(s) => updateStatus(u.uid, s)}
                          onExpiry={(d) => updateExpiry(u.uid, d)}
                          onDelete={() => deleteUser(u.uid)}
                        />
                      ))}
                      {filtered.length === 0 && (
                        <tr><td colSpan={11} className="py-12 text-center text-white/30 text-sm">
                          {search ? 'No matching users.' : 'No users yet.'}
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden flex flex-col gap-3">
                  {filtered.map((u) => (
                    <MobileCard key={u.uid} user={u} month={month} week={week}
                      onPlan={(p)   => updatePlan(u.uid, p)}
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

            {/* Sent invites */}
            {invites.length > 0 && (
              <InviteList
                invites={invites}
                onResend={resendInvite}
                onDelete={deleteInvite}
              />
            )}
          </>
        )}

        {/* ── SUBSCRIBERS TAB ───────────────────────────────────────────── */}
        {tab === 'subscribers' && (
          <SubscribersSection
            users={users} loading={loading} error={error} refresh={refresh}
            resyncStripe={resyncStripe}
          />
        )}

        {/* ── API KEYS TAB ──────────────────────────────────────────────── */}
        {tab === 'apikeys' && (
          <ApiKeysSection apiKeys={apiKeys} saveApiKeys={saveApiKeys} />
        )}

        {/* ── CONFIG TAB ────────────────────────────────────────────────── */}
        {tab === 'config' && (
          <ConfigSection
            billing={billing} saveBilling={saveBilling}
            limits={limits} saveLimits={saveLimits}
            isSuperAdmin={isSuperAdmin} users={users}
            adminUids={adminUids} addAdmin={addAdmin} removeAdmin={removeAdmin}
          />
        )}
      </main>

      {showInvite && (
        <InviteModal onClose={() => setShowInvite(false)} onInvite={inviteUser} />
      )}
    </div>
  );
}

// ── Tab button ────────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition
        ${active ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}>
      {children}
    </button>
  );
}

// ── Desktop table row ─────────────────────────────────────────────────────────

function DesktopRow({ user, month, week, onPlan, onStatus, onExpiry, onDelete }) {
  const [busy, setBusy] = useState(false);
  const suspended = user.status === 'suspended';
  const expired   = isExpired(user.expiresAt);

  const gensWeek   = user.usageWeekly?.[week]       || 0;
  const audioWeek  = user.audioWordsWeekly?.[week]  || 0;
  const gensAll    = user.allTimeUsage              || 0;
  const audioAll   = user.allTimeAudioWords         || 0;

  async function wrap(fn) { setBusy(true); try { await fn(); } finally { setBusy(false); } }

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
        <ManualExpiryCell value={user.expiresAt} expired={expired} busy={busy}
          onChange={(d) => wrap(() => onExpiry(d))} />
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-white/80">{gensWeek.toLocaleString()}</td>
      <td className="px-3 py-3 text-right tabular-nums text-white/80">{audioWeek.toLocaleString()}</td>
      <td className="px-3 py-3 text-right tabular-nums text-white/60 text-xs">{gensAll.toLocaleString()}</td>
      <td className="px-3 py-3 text-right tabular-nums text-white/60 text-xs">{audioAll.toLocaleString()}</td>
      <td className="px-4 py-3 text-right text-white/40 text-xs">{fmtDate(user.createdAt)}</td>
      <td className="px-4 py-3 text-right text-white/40 text-xs">{fmtRelative(user.lastSeen)}</td>
      <td className="px-4 py-3 text-right">
        <button type="button" onClick={() => { if (window.confirm(`Delete ${user.email}? Cannot be undone.`)) wrap(onDelete); }}
          disabled={busy}
          className="text-[11px] text-red-400/70 hover:text-red-400 border border-red-400/20
                     hover:border-red-400/40 rounded-lg px-2.5 py-1 transition disabled:opacity-40">
          Delete
        </button>
      </td>
    </tr>
  );
}

// ── Mobile card ───────────────────────────────────────────────────────────────

function MobileCard({ user, month, week, onPlan, onStatus, onExpiry, onDelete }) {
  const [busy, setBusy] = useState(false);
  const [showExpiry, setShowExpiry] = useState(false);
  const suspended = user.status === 'suspended';
  const expired   = isExpired(user.expiresAt);

  const gensWeek  = user.usageWeekly?.[week]       || 0;
  const audioWeek = user.audioWordsWeekly?.[week]  || 0;
  const gensAll   = user.allTimeUsage              || 0;
  const audioAll  = user.allTimeAudioWords         || 0;

  async function wrap(fn) { setBusy(true); try { await fn(); } finally { setBusy(false); } }

  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.03] p-4 ${suspended ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3 mb-3">
        <Avatar user={user} size="md" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{user.displayName || '—'}</div>
          <div className="text-xs text-white/40 truncate">{user.email}</div>
          {suspended && <span className="inline-block mt-0.5 text-[10px] text-red-400 bg-red-500/10 border border-red-400/30 rounded-full px-2 py-0.5">Suspended</span>}
          {expired && !suspended && <span className="inline-block mt-0.5 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-400/30 rounded-full px-2 py-0.5">Expired</span>}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <PlanSelect value={user.plan} onChange={(p) => wrap(() => onPlan(p))} busy={busy} />
        <StatusToggle suspended={suspended} onChange={(s) => wrap(() => onStatus(s))} busy={busy} />
        <button type="button" onClick={() => setShowExpiry((v) => !v)}
          className="text-[11px] text-white/50 border border-white/15 rounded-full px-2.5 py-1 hover:border-white/30 transition">
          {user.expiresAt ? `Manual expiry ${fmtDate(user.expiresAt)}` : '+ Manual expiry'}
        </button>
      </div>

      {showExpiry && (
        <div className="mb-3">
          <ExpiryPicker value={user.expiresAt} expired={expired} onChange={(d) => wrap(() => onExpiry(d))} busy={busy} full />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/5">
        <MiniStat label="Gens / week"     value={gensWeek.toLocaleString()} />
        <MiniStat label="Audio / week"    value={audioWeek.toLocaleString()} />
        <MiniStat label="Gens all-time"   value={gensAll.toLocaleString()} />
        <MiniStat label="Audio all-time"  value={audioAll.toLocaleString()} />
        <MiniStat label="Joined"          value={fmtDate(user.createdAt)} />
        <MiniStat label="Last seen"       value={fmtRelative(user.lastSeen)} />
      </div>

      <button type="button" onClick={() => { if (window.confirm(`Delete ${user.email}?\nCannot be undone.`)) wrap(onDelete); }}
        disabled={busy}
        className="mt-3 w-full text-center text-xs text-red-400/60 hover:text-red-400
                   border border-red-400/15 hover:border-red-400/30 rounded-xl py-2 transition disabled:opacity-40">
        Delete user
      </button>
    </div>
  );
}

// ── Sent-invites list ─────────────────────────────────────────────────────────

function InviteList({ invites, onResend, onDelete }) {
  const [secret, setSecret] = useState(() => {
    try { return localStorage.getItem('fw_invite_key') || ''; } catch { return ''; }
  });
  const [busyId, setBusyId] = useState(null);
  const [resentId, setResentId] = useState(null);

  async function handleResend(inv) {
    if (!secret) {
      const s = window.prompt('Enter your invite key to resend:');
      if (!s) return;
      try { localStorage.setItem('fw_invite_key', s.trim()); } catch { /* ignore */ }
      setSecret(s.trim());
    }
    setBusyId(inv.id);
    try {
      await onResend(inv, secret);
      setResentId(inv.id);
      setTimeout(() => setResentId(null), 2000);
    } catch (e) {
      window.alert(`Resend failed: ${e.message}`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(inv) {
    if (!window.confirm(`Remove invite for ${inv.email}?`)) return;
    setBusyId(inv.id);
    try { await onDelete(inv.id); } catch { /* ignore */ } finally { setBusyId(null); }
  }

  return (
    <div className="mt-8">
      <h3 className="text-[10px] uppercase tracking-wider text-white/30 mb-2">
        Sent invites ({invites.length})
      </h3>
      <div className="rounded-2xl border border-white/10 divide-y divide-white/5 overflow-hidden">
        {invites.map((inv) => (
          <div key={inv.id}
            className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-white/[0.02] transition">
            <span className="truncate text-white/80 min-w-0">{inv.email}</span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-white/30 hidden sm:block">{fmtDate(inv.createdAt)}</span>
              <span className={`text-[10px] rounded-full px-2 py-0.5 border
                ${inv.status === 'resent'
                  ? 'text-sky-300 bg-sky-500/10 border-sky-400/30'
                  : 'text-violet-300 bg-violet-500/10 border-violet-400/30'}`}>
                {inv.status || 'sent'}
              </span>
              {resentId === inv.id
                ? <span className="text-[11px] text-emerald-400">✓ Resent</span>
                : (
                  <button type="button"
                    onClick={() => handleResend(inv)}
                    disabled={busyId === inv.id}
                    className="text-[11px] text-white/50 hover:text-white border border-white/10
                               hover:border-white/30 rounded-lg px-2 py-0.5 transition disabled:opacity-40">
                    {busyId === inv.id ? '…' : 'Resend'}
                  </button>
                )
              }
              <button type="button"
                onClick={() => handleDelete(inv)}
                disabled={busyId === inv.id}
                className="text-[11px] text-red-400/60 hover:text-red-400 border border-red-400/15
                           hover:border-red-400/30 rounded-lg px-2 py-0.5 transition disabled:opacity-40">
                ✕
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shared controls ───────────────────────────────────────────────────────────

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
    <button type="button" disabled={busy}
      onClick={() => onChange(suspended ? 'active' : 'suspended')}
      title={suspended ? 'Click to activate' : 'Click to suspend'}
      className={`text-[11px] font-medium rounded-full px-2.5 py-1 border transition
                  ${busy ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  ${suspended
                    ? 'text-red-400 border-red-400/40 bg-red-500/10 hover:bg-red-500/20'
                    : 'text-emerald-400 border-emerald-400/40 bg-emerald-500/10 hover:bg-emerald-500/20'}`}>
      {suspended ? '✕ Suspended' : '✓ Active'}
    </button>
  );
}

// Desktop Users-tab cell. Default state is just a text label so each row looks
// distinct: "Until <date>" if a manual expiry is set, or a subtle "+ Set" link
// if not. Clicking either reveals the date picker (and a clear button). This
// keeps the column honest — empty rows look empty instead of showing identical
// "mm/dd/yyyy" placeholders in every row.
function ManualExpiryCell({ value, expired, onChange, busy }) {
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <div className="flex items-center gap-1.5">
        <ExpiryPicker value={value} expired={expired} onChange={onChange} busy={busy} />
        <button type="button" onClick={() => setOpen(false)}
          className="text-white/30 hover:text-white/70 text-xs transition">done</button>
      </div>
    );
  }
  if (value) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className={'text-[12px] rounded-full px-2.5 py-1 border transition '
          + (expired
            ? 'text-amber-300 border-amber-400/30 bg-amber-500/10 hover:border-amber-400/50'
            : 'text-white/70 border-white/15 hover:border-white/30')}
        title={expired ? 'Manual expiry has passed' : 'Click to edit'}>
        Until {fmtDate(value)}{expired && ' · expired'}
      </button>
    );
  }
  return (
    <button type="button" onClick={() => setOpen(true)}
      className="text-[11px] text-white/30 hover:text-white/60 border border-dashed border-white/10
                 hover:border-white/25 rounded-full px-2.5 py-1 transition">
      + Set
    </button>
  );
}

function ExpiryPicker({ value, expired, onChange, busy, full }) {
  return (
    <div className={`flex items-center gap-1.5 ${full ? 'w-full' : ''}`}>
      <input type="date" value={toInputDate(value)}
        onChange={(e) => onChange(e.target.value || null)} disabled={busy}
        className={`bg-white/5 border rounded-lg px-2 py-1 text-xs text-white/80
                    focus:outline-none focus:border-violet-400/50 transition disabled:opacity-50
                    ${full ? 'flex-1' : 'w-36'}
                    ${expired ? 'border-amber-400/40 text-amber-300' : 'border-white/15'}`} />
      {value && (
        <button type="button" onClick={() => onChange(null)} disabled={busy}
          className="text-white/30 hover:text-white/70 text-xs transition disabled:opacity-40">✕</button>
      )}
    </div>
  );
}

function Avatar({ user, size }) {
  const cls = size === 'md'
    ? 'w-10 h-10 rounded-full shrink-0 text-sm font-semibold'
    : 'w-7 h-7 rounded-full shrink-0 text-xs font-semibold';
  if (user.photoURL) return <img src={user.photoURL} alt="" className={cls} referrerPolicy="no-referrer" />;
  return (
    <div className={`${cls} bg-white/10 flex items-center justify-center`}>
      {(user.displayName || user.email || '?')[0].toUpperCase()}
    </div>
  );
}

function MiniStat({ label, value, highlight }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">{label}</div>
      <div className={`text-sm font-medium ${highlight ? 'text-amber-300' : 'text-white/80'}`}>{value}</div>
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

// ── Reset-free-usage button ─────────────────────────────────────────────────

function ResetFreeButton({ onReset }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);

  async function handle() {
    if (!window.confirm(
      "Reset THIS WEEK's usage counters (popup generations + dictated words) "
      + 'for ALL free users? They get a fresh weekly allowance immediately. '
      + 'Pro/Team users are unaffected.',
    )) return;
    setBusy(true);
    try {
      const n = await onReset();
      setDone(n);
      setTimeout(() => setDone(0), 3000);
    } catch (e) {
      window.alert(`Reset failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={handle} disabled={busy} title="Reset free users' weekly usage"
      className="shrink-0 h-10 px-3 flex items-center gap-1.5 rounded-xl border border-amber-400/30
                 bg-amber-500/10 text-amber-300 text-xs font-medium hover:bg-amber-500/20
                 transition disabled:opacity-50">
      {busy ? '…' : done ? `✓ Reset ${done}` : '⟲ Reset free usage'}
    </button>
  );
}

// ── Subscribers tab ──────────────────────────────────────────────────────────

function SubscribersSection({ users, loading, error, refresh, resyncStripe }) {
  const subs = useMemo(
    () => users
      .filter((u) => u.plan === 'pro' || u.plan === 'team')
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [users],
  );

  const mrr = subs.length * 10; // $10/mo Pro — rough gross MRR
  const [resyncingUid, setResyncingUid] = useState(null);
  const [resyncSecret, setResyncSecret] = useState(() => {
    try { return localStorage.getItem('fw_invite_key') || ''; } catch { return ''; }
  });

  async function handleResync(u) {
    let secret = resyncSecret;
    if (!secret) {
      secret = window.prompt('Enter admin secret (same as invite key):') || '';
      if (!secret) return;
      try { localStorage.setItem('fw_invite_key', secret.trim()); } catch { /* ignore */ }
      setResyncSecret(secret.trim());
    }
    setResyncingUid(u.uid);
    try {
      const r = await resyncStripe(u.uid, secret);
      const when = r.currentPeriodEnd
        ? new Date(r.currentPeriodEnd * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'no renewal date';
      window.alert(`✓ Resynced ${u.email}\nPlan: ${r.plan}\nStatus: ${r.subscriptionStatus}\nRenews: ${when}`);
    } catch (e) {
      window.alert(`Resync failed: ${e.message}`);
    } finally {
      setResyncingUid(null);
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <StatCard label="Active subscribers" value={subs.length} accent />
        <StatCard label="Pro" value={subs.filter((u) => u.plan === 'pro').length} />
        <StatCard label="Est. gross MRR" value={`$${mrr}`} />
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">Subscribers</h2>
        <button type="button" onClick={refresh} title="Refresh"
          className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl
                     border border-white/10 bg-white/5 hover:bg-white/10 transition text-sm">↻</button>
      </div>

      {loading && <div className="py-16 text-center text-white/40 text-sm">Loading…</div>}
      {error   && <div className="py-8 text-center text-red-400 text-sm">{error}</div>}

      {!loading && !error && (
        subs.length === 0 ? (
          <div className="py-16 text-center text-white/30 text-sm">
            No paid subscribers yet. When someone completes Stripe checkout they'll appear here.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block rounded-2xl border border-white/10 overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 760 }}>
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-white/30 border-b border-white/10 bg-white/[0.025]">
                    <th className="text-left px-4 py-3">Subscriber</th>
                    <th className="text-left px-4 py-3">Plan</th>
                    <th className="text-left px-4 py-3">Subscription</th>
                    <th className="text-right px-4 py-3" title="Next Stripe renewal — kept in sync by the webhook.">Renews on</th>
                    <th className="text-right px-4 py-3">Member since</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((u) => (
                    <tr key={u.uid} className="border-b border-white/5 hover:bg-white/[0.02] transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar user={u} />
                          <div className="min-w-0">
                            <div className="font-medium truncate max-w-[180px]">{u.displayName || '—'}</div>
                            <div className="text-[11px] text-white/40 truncate max-w-[180px]">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold rounded-full px-2.5 py-1 border ${PLAN_STYLE[u.plan]}`}>
                          {u.plan === 'team' ? 'Team' : 'Pro'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-medium rounded-full px-2.5 py-1 border
                          ${SUB_STATUS_STYLE[u.subscriptionStatus] || 'text-white/50 border-white/15 bg-white/5'}`}>
                          {u.subscriptionStatus || (u.stripeCustomerId ? 'active' : 'manual')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-white/60 text-xs">{fmtPeriodEnd(u.currentPeriodEnd)}</td>
                      <td className="px-4 py-3 text-right text-white/40 text-xs">{fmtDate(u.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => handleResync(u)}
                          disabled={resyncingUid === u.uid}
                          title="Re-fetch this subscription from Stripe and update Firestore"
                          className="text-[11px] text-white/50 hover:text-white border border-white/10
                                     hover:border-white/30 rounded-lg px-2.5 py-1 transition disabled:opacity-40">
                          {resyncingUid === u.uid ? '…' : '↻ Resync'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden flex flex-col gap-3">
              {subs.map((u) => (
                <div key={u.uid} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <Avatar user={u} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{u.displayName || '—'}</div>
                      <div className="text-xs text-white/40 truncate">{u.email}</div>
                    </div>
                    <span className={`text-xs font-semibold rounded-full px-2.5 py-1 border ${PLAN_STYLE[u.plan]}`}>
                      {u.plan === 'team' ? 'Team' : 'Pro'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/5">
                    <MiniStat label="Subscription" value={u.subscriptionStatus || (u.stripeCustomerId ? 'active' : 'manual')} />
                    <MiniStat label="Renews on"   value={fmtPeriodEnd(u.currentPeriodEnd)} />
                    <MiniStat label="Member since" value={fmtDate(u.createdAt)} />
                  </div>
                  <button type="button" onClick={() => handleResync(u)}
                    disabled={resyncingUid === u.uid}
                    className="mt-3 w-full text-center text-xs text-white/60 hover:text-white
                               border border-white/15 hover:border-white/30 rounded-xl py-2 transition disabled:opacity-40">
                    {resyncingUid === u.uid ? '…' : '↻ Resync from Stripe'}
                  </button>
                </div>
              ))}
            </div>

            <p className="text-xs text-white/25 mt-4 text-right">
              {subs.length} subscriber{subs.length !== 1 ? 's' : ''}
            </p>
          </>
        )
      )}
    </>
  );
}

// ── Admins manager (super-admin only) ────────────────────────────────────────

function AdminsManager({ users, adminUids, addAdmin, removeAdmin }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy]   = useState(false);
  const [err,  setErr]    = useState('');
  const [done, setDone]   = useState('');

  const emailFor = (uid) => users.find((u) => u.uid === uid)?.email || uid;
  const superEmail = emailFor(ADMIN_UID);

  async function handleAdd(e) {
    e.preventDefault();
    setErr(''); setDone('');
    const clean = email.trim().toLowerCase();
    if (!clean) return;
    const match = users.find((u) => (u.email || '').toLowerCase() === clean);
    if (!match) {
      setErr('No signed-in user with that email. They must open FlowWrite and sign in once first.');
      return;
    }
    if (match.uid === ADMIN_UID) { setErr('That account is already the super-admin.'); return; }
    if (adminUids.includes(match.uid)) { setErr('That user is already an admin.'); return; }
    setBusy(true);
    try {
      await addAdmin(match.uid);
      setDone(`Added ${clean} as admin.`);
      setEmail('');
      setTimeout(() => setDone(''), 2500);
    } catch (e2) {
      setErr(e2.message || 'Failed to add admin.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(uid) {
    if (!window.confirm(`Remove admin access for ${emailFor(uid)}?`)) return;
    try { await removeAdmin(uid); } catch (e) { window.alert(`Failed: ${e.message}`); }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 mb-6">
      <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1">Admins</div>
      <p className="text-[11px] text-white/35 mb-4 leading-relaxed">
        Admins have full access — all users, billing secrets and API keys. Only
        you (the super-admin) can change this list.
      </p>

      <div className="rounded-xl border border-white/10 divide-y divide-white/5 overflow-hidden mb-4">
        {/* Super admin (permanent) */}
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
          <span className="truncate text-white/80">{superEmail}</span>
          <span className="shrink-0 text-[10px] rounded-full px-2 py-0.5 border text-violet-300 bg-violet-500/10 border-violet-400/30">
            Super-admin
          </span>
        </div>
        {/* Additional admins */}
        {adminUids.filter((uid) => uid !== ADMIN_UID).map((uid) => (
          <div key={uid} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="truncate text-white/80 min-w-0">{emailFor(uid)}</span>
            <button type="button" onClick={() => handleRemove(uid)}
              className="shrink-0 text-[11px] text-red-400/70 hover:text-red-400 border border-red-400/20
                         hover:border-red-400/40 rounded-lg px-2.5 py-1 transition">
              Remove
            </button>
          </div>
        ))}
      </div>

      <form onSubmit={handleAdd} className="flex items-center gap-2">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="Add admin by email (must have signed in once)…"
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm
                     placeholder-white/25 focus:outline-none focus:border-violet-400/50 transition" />
        <button type="submit" disabled={busy}
          className="shrink-0 px-4 py-2.5 rounded-xl bg-violet-500/90 hover:bg-violet-500 text-white
                     text-sm font-medium transition disabled:opacity-50">
          {busy ? '…' : 'Add'}
        </button>
      </form>
      {err  && <div className="mt-2 text-xs text-red-400">{err}</div>}
      {done && <div className="mt-2 text-xs text-emerald-400">✓ {done}</div>}
    </div>
  );
}

// ── Free-plan limits card (admin-managed) ─────────────────────────────────────
function LimitsCard({ limits, saveLimits }) {
  const [gens, setGens]   = useState(limits.freeWeeklyGenerations);
  const [words, setWords] = useState(limits.freeWeeklyAudioWords);
  const [busy, setBusy]   = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr]     = useState('');

  // Sync local draft when Firestore data arrives / changes.
  useEffect(() => {
    setGens(limits.freeWeeklyGenerations);
    setWords(limits.freeWeeklyAudioWords);
  }, [limits.freeWeeklyGenerations, limits.freeWeeklyAudioWords]);

  async function handleSave(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await saveLimits({ freeWeeklyGenerations: gens, freeWeeklyAudioWords: words });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e2) {
      setErr(e2.message || 'Failed to save limits.');
    } finally {
      setBusy(false);
    }
  }

  const changed = gens !== limits.freeWeeklyGenerations || words !== limits.freeWeeklyAudioWords;

  return (
    <form onSubmit={handleSave} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 mb-6">
      <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1">Free-plan weekly limits</div>
      <p className="text-[11px] text-white/35 mb-4 leading-relaxed">
        How much free users get each week before the Pro paywall kicks in. The app
        and the desktop both read these live — no release needed.
      </p>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-white/40">AI generations / week</span>
          <input type="number" min="0" value={gens}
            onChange={(e) => setGens(parseInt(e.target.value, 10) || 0)}
            className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm
                       focus:outline-none focus:border-violet-400/50 transition" />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-white/40">Dictated words / week</span>
          <input type="number" min="0" value={words}
            onChange={(e) => setWords(parseInt(e.target.value, 10) || 0)}
            className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm
                       focus:outline-none focus:border-violet-400/50 transition" />
        </label>
      </div>
      {err && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-400/20 rounded-lg px-3 py-2 mb-2">{err}</div>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy || !changed}
          className="px-4 py-2 rounded-xl bg-violet-500/90 hover:bg-violet-500 text-white
                     text-sm font-medium transition disabled:opacity-50">
          {busy ? 'Saving…' : 'Save limits'}
        </button>
        {saved && <span className="text-xs text-emerald-400">✓ Saved — live immediately</span>}
        <span className="ml-auto text-[11px] text-white/30">Defaults: 50 / 2 500</span>
      </div>
    </form>
  );
}

// ── Config section (Stripe + email + URLs, stored in Firestore) ───────────────

function ConfigSection({ billing, saveBilling, limits, saveLimits, isSuperAdmin, users, adminUids, addAdmin, removeAdmin }) {
  const [draft, setDraft] = useState(billing);
  const [populated, setPopulated] = useState(false);
  const [busy, setBusy]   = useState(false);
  const [saved, setSaved] = useState(false);
  const [err,  setErr]    = useState('');

  // Populate once Firestore data arrives.
  useEffect(() => {
    if (populated) return;
    const hasData = billing && (billing.stripe_secret_key || billing.smtp_user || billing.stripe_price_id);
    if (hasData) { setDraft(billing); setPopulated(true); }
  }, [billing, populated]);

  function set(field) { return (v) => setDraft((d) => ({ ...d, [field]: v })); }

  async function handleSave(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await saveBilling(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e2) {
      setErr(e2.message || 'Failed to save config.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-base font-semibold mb-1">Configuration</h2>
      <p className="text-xs text-white/40 mb-2 leading-relaxed">
        Stripe, email and URL settings — stored securely in Firestore and read by
        the server. Editing here means you never have to touch files on the host
        again. Secrets are masked; only the service-account path stays in a file.
      </p>
      <div className="text-[11px] text-amber-300/70 bg-amber-500/5 border border-amber-400/20 rounded-lg px-3 py-2 mb-6">
        These values include live secrets (Stripe key, mailbox password). They're
        stored admin-only and sent over HTTPS — keep your admin account secure.
      </div>

      {/* Admins — super-admin only */}
      {isSuperAdmin && (
        <AdminsManager users={users} adminUids={adminUids} addAdmin={addAdmin} removeAdmin={removeAdmin} />
      )}

      {/* Free-plan weekly limits */}
      <LimitsCard limits={limits} saveLimits={saveLimits} />

      <form onSubmit={handleSave} className="flex flex-col gap-5">

        {/* Stripe */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 flex flex-col gap-4">
          <div className="text-[10px] uppercase tracking-wider text-white/30">Stripe</div>
          <KeyField label="Secret key" hint="sk_test_… (test mode) or sk_live_… (live)."
            placeholder="sk_test_…" value={draft.stripe_secret_key} onChange={set('stripe_secret_key')} />
          <TextInput label="Price ID" hint="The recurring Pro price — starts with price_ (NOT prod_)."
            placeholder="price_…" value={draft.stripe_price_id} onChange={set('stripe_price_id')} />
          <KeyField label="Webhook signing secret" hint="whsec_… from your webhook endpoint."
            placeholder="whsec_…" value={draft.stripe_webhook_secret} onChange={set('stripe_webhook_secret')} />
        </div>

        {/* URLs */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 flex flex-col gap-4">
          <div className="text-[10px] uppercase tracking-wider text-white/30">URLs</div>
          <TextInput label="Site URL" value={draft.site_url} onChange={set('site_url')} placeholder="https://flowwrite.u11.ca" />
          <TextInput label="Success URL" hint="Where Stripe sends users after paying."
            value={draft.success_url} onChange={set('success_url')} placeholder="https://flowwrite.u11.ca/?upgraded=1" />
          <TextInput label="Cancel URL" value={draft.cancel_url} onChange={set('cancel_url')} placeholder="https://flowwrite.u11.ca/?cancelled=1" />
          <TextInput label="Billing-portal return URL" value={draft.return_url} onChange={set('return_url')} placeholder="https://flowwrite.u11.ca/" />
        </div>

        {/* Email / SMTP */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 flex flex-col gap-4">
          <div className="text-[10px] uppercase tracking-wider text-white/30">Email (SMTP)</div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <TextInput label="SMTP host" value={draft.smtp_host} onChange={set('smtp_host')} placeholder="mail.u11.ca" />
            </div>
            <TextInput label="Port" value={String(draft.smtp_port ?? '')} onChange={set('smtp_port')} placeholder="465" />
          </div>
          <TextInput label="SMTP username" value={draft.smtp_user} onChange={set('smtp_user')} placeholder="flowwrite@u11.ca" />
          <KeyField label="Mailbox password" hint="The password for the SMTP mailbox above."
            placeholder="••••••••" value={draft.smtp_pass} onChange={set('smtp_pass')} />
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="From email" value={draft.from_email} onChange={set('from_email')} placeholder="flowwrite@u11.ca" />
            <TextInput label="From name" value={draft.from_name} onChange={set('from_name')} placeholder="FlowWrite" />
          </div>
          <TextInput label="Owner alert email" hint="Gets a 🎉 alert on each new Pro subscriber. Blank = off."
            value={draft.owner_notify} onChange={set('owner_notify')} placeholder="you@example.com" />
        </div>

        {/* Invite */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 flex flex-col gap-4">
          <div className="text-[10px] uppercase tracking-wider text-white/30">Invites</div>
          <KeyField label="Invite secret" hint="Must match what you type in the Invite dialog. Leave blank to keep the built-in fallback."
            placeholder="long random string" value={draft.invite_secret} onChange={set('invite_secret')} />
        </div>

        {err && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-400/20 rounded-lg px-3 py-2">{err}</div>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy}
            className="px-5 py-2 rounded-xl bg-violet-500/90 hover:bg-violet-500 text-white
                       text-sm font-medium transition disabled:opacity-50">
            {busy ? 'Saving…' : 'Save config'}
          </button>
          {saved && <span className="text-xs text-emerald-400">✓ Saved — live immediately</span>}
        </div>
      </form>
    </div>
  );
}

function TextInput({ label, hint, placeholder, value, onChange }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-white/40">{label}</span>
      {hint && <span className="block text-[11px] text-white/30 mt-0.5 mb-1.5">{hint}</span>}
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm
                   placeholder-white/20 focus:outline-none focus:border-violet-400/50 transition"
      />
    </label>
  );
}

// ── API Keys section ──────────────────────────────────────────────────────────

const OPENAI_MODELS = [
  { value: 'gpt-4o',       label: 'GPT-4o (best quality)' },
  { value: 'gpt-4o-mini',  label: 'GPT-4o Mini (faster / cheaper)' },
  { value: 'gpt-4-turbo',  label: 'GPT-4 Turbo' },
];

const DEEPSEEK_MODELS = [
  { value: 'deepseek-v4-flash', label: 'DeepSeek-V4 Flash (fast & cost-efficient)' },
  { value: 'deepseek-v4-pro',   label: 'DeepSeek-V4 Pro (frontier reasoning)' },
  { value: 'deepseek-chat',     label: 'deepseek-chat (legacy · retires Jul 2026)' },
  { value: 'deepseek-reasoner', label: 'deepseek-reasoner (legacy · retires Jul 2026)' },
];

function ApiKeysSection({ apiKeys, saveApiKeys }) {
  const [draft, setDraft] = useState({
    popupProvider:    'claude',
    anthropic:        '',
    openaiPopup:      '',
    openaiPopupModel: 'gpt-4o',
    deepseek:         '',
    deepseekModel:    'deepseek-v4-flash',
    openai:           '',
    transcribeProvider: 'openai',
    hermesUrl:          '',
    hermesKey:          '',
    hermesModel:        'whisper-1',
  });
  const [populated, setPopulated] = useState(false);
  const [busy, setBusy]   = useState(false);
  const [saved, setSaved] = useState(false);
  const [err,  setErr]    = useState('');

  // One-time populate from Firestore once loaded.
  useEffect(() => {
    if (populated) return;
    const hasData = apiKeys.anthropic || apiKeys.openaiPopup || apiKeys.deepseek || apiKeys.openai || apiKeys.popupProvider;
    if (hasData) {
      setDraft({
        popupProvider:    apiKeys.popupProvider    || 'claude',
        anthropic:        apiKeys.anthropic        || '',
        openaiPopup:      apiKeys.openaiPopup      || '',
        openaiPopupModel: apiKeys.openaiPopupModel || 'gpt-4o',
        deepseek:         apiKeys.deepseek         || '',
        deepseekModel:    apiKeys.deepseekModel    || 'deepseek-v4-flash',
        openai:           apiKeys.openai           || '',
        transcribeProvider: apiKeys.transcribeProvider || 'openai',
        hermesUrl:          apiKeys.hermesUrl          || '',
        hermesKey:          apiKeys.hermesKey          || '',
        hermesModel:        apiKeys.hermesModel        || 'whisper-1',
      });
      setPopulated(true);
    }
  }, [apiKeys, populated]);

  function set(field) { return (v) => setDraft((d) => ({ ...d, [field]: v })); }

  async function handleSave(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await saveApiKeys(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e2) {
      setErr(e2.message || 'Failed to save keys.');
    } finally {
      setBusy(false);
    }
  }

  const provider = draft.popupProvider;
  const isClaude = provider === 'claude';
  const isOpenai = provider === 'openai';
  const isDeepseek = provider === 'deepseek';

  return (
    <div className="max-w-xl">
      <h2 className="text-base font-semibold mb-1">API Keys</h2>
      <p className="text-xs text-white/40 mb-6 leading-relaxed">
        Stored securely in Firestore and synced to the app automatically.
        Customers never see or enter them. Changes take effect within seconds
        for any signed-in user.
      </p>

      <form onSubmit={handleSave} className="flex flex-col gap-5">

        {/* ── Section 1: Popup AI ───────────────────────────────────────── */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 flex flex-col gap-5">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/30 mb-3">
              Popup AI — text generation
            </div>

            {/* Provider selector */}
            <div className="mb-5">
              <span className="block text-[10px] uppercase tracking-wider text-white/40 mb-2">
                AI Provider
              </span>
              <div className="flex gap-2">
                {[
                  { value: 'claude',   label: 'Claude',   ring: 'border-violet-400/60 bg-violet-500/15 text-violet-200' },
                  { value: 'openai',   label: 'ChatGPT',  ring: 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200' },
                  { value: 'deepseek', label: 'DeepSeek', ring: 'border-sky-400/60 bg-sky-500/15 text-sky-200' },
                ].map(({ value, label, ring }) => {
                  const active = draft.popupProvider === value;
                  return (
                    <button key={value} type="button"
                      onClick={() => setDraft((d) => ({ ...d, popupProvider: value }))}
                      className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition
                        ${active ? ring : 'border-white/10 bg-white/5 text-white/40 hover:text-white/60 hover:border-white/20'}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Claude key (shown when provider = claude) */}
            {isClaude && (
              <KeyField
                label="Anthropic API Key"
                hint="Used for all popup generation (Claude Opus)."
                placeholder="sk-ant-api03-…"
                value={draft.anthropic}
                onChange={set('anthropic')}
              />
            )}

            {/* OpenAI popup key + model (shown when provider = openai) */}
            {isOpenai && (
              <div className="flex flex-col gap-4">
                <KeyField
                  label="OpenAI API Key (popup)"
                  hint="Used for popup text generation via ChatGPT."
                  placeholder="sk-proj-…"
                  value={draft.openaiPopup}
                  onChange={set('openaiPopup')}
                />
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wider text-white/40">Model</span>
                  <select
                    value={draft.openaiPopupModel}
                    onChange={(e) => setDraft((d) => ({ ...d, openaiPopupModel: e.target.value }))}
                    className="mt-1.5 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5
                               text-sm focus:outline-none focus:border-violet-400/50 transition">
                    {OPENAI_MODELS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {/* DeepSeek key + model (shown when provider = deepseek) */}
            {isDeepseek && (
              <div className="flex flex-col gap-4">
                <KeyField
                  label="DeepSeek API Key (popup)"
                  hint="Used for popup text generation via DeepSeek (OpenAI-compatible API)."
                  placeholder="sk-…"
                  value={draft.deepseek}
                  onChange={set('deepseek')}
                />
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wider text-white/40">Model</span>
                  <select
                    value={draft.deepseekModel}
                    onChange={(e) => setDraft((d) => ({ ...d, deepseekModel: e.target.value }))}
                    className="mt-1.5 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5
                               text-sm focus:outline-none focus:border-violet-400/50 transition">
                    {DEEPSEEK_MODELS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>

          {/* Cost reference */}
          <div className="pt-1 border-t border-white/5">
            <div className="text-[10px] uppercase tracking-wider text-white/25 mb-2">
              Estimated cost per popup request (used in Users tab)
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 inline-block">
              <div className="text-[10px] text-white/40 mb-0.5">Per generation</div>
              <div className="text-sm font-mono text-amber-300">${COST_PER_POPUP.toFixed(3)}</div>
              <div className="text-[10px] text-white/25 mt-0.5">
                {isClaude ? 'Claude Opus est.' : isDeepseek ? 'DeepSeek est.' : 'GPT-4o est.'}
              </div>
            </div>
          </div>
        </div>

        {/* ── Section 2: Audio Transcription (voice dictation) ─────────── */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 flex flex-col gap-5">
          <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1">
            Audio Transcription — voice dictation
          </div>

          {/* Provider selector — matches the popup-AI pattern */}
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-white/40 mb-2">
              Transcription Provider
            </span>
            <div className="flex gap-2">
              {[
                { value: 'openai', label: 'OpenAI Whisper',   ring: 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200',
                  hint: 'Hosted Whisper API (paid · $0.006/min). Reliable, easy.' },
                { value: 'hermes', label: 'Hermes (self-host)', ring: 'border-amber-400/60 bg-amber-500/15 text-amber-200',
                  hint: 'Your own faster-whisper server. FREE, OpenAI-compatible.' },
              ].map(({ value, label, ring }) => {
                const active = draft.transcribeProvider === value;
                return (
                  <button key={value} type="button"
                    onClick={() => setDraft((d) => ({ ...d, transcribeProvider: value }))}
                    className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition
                      ${active ? ring : 'border-white/10 bg-white/5 text-white/40 hover:text-white/60 hover:border-white/20'}`}>
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="text-[11px] text-white/40 mt-2">
              {draft.transcribeProvider === 'hermes'
                ? 'Routes voice dictation through your Hermes server (any OpenAI-compatible Whisper endpoint).'
                : 'Routes voice dictation through OpenAI\'s hosted Whisper API.'}
            </div>
          </div>

          {/* OpenAI Whisper key (shown when provider = openai) */}
          {draft.transcribeProvider === 'openai' && (
            <KeyField
              label="OpenAI API Key (Whisper)"
              hint="Used for voice dictation (Whisper) and grammar cleanup."
              placeholder="sk-proj-…"
              value={draft.openai}
              onChange={set('openai')}
            />
          )}

          {/* Hermes fields (shown when provider = hermes) */}
          {draft.transcribeProvider === 'hermes' && (
            <div className="flex flex-col gap-4">
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-white/40">Base URL (include /v1)</span>
                <span className="block text-[11px] text-white/30 mt-0.5 mb-1.5">
                  e.g. <code className="text-amber-300/80">http://144.126.146.220:8000/v1</code>
                </span>
                <input type="text"
                  value={draft.hermesUrl}
                  onChange={(e) => setDraft((d) => ({ ...d, hermesUrl: e.target.value }))}
                  placeholder="http://your-server:8000/v1"
                  autoComplete="off" spellCheck={false}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm font-mono
                             placeholder-white/20 focus:outline-none focus:border-amber-400/50 transition" />
              </label>
              <KeyField
                label="Hermes API Key"
                hint="The token your Hermes server requires (sent as Bearer auth)."
                placeholder="u11-whisper-free-2026"
                value={draft.hermesKey}
                onChange={set('hermesKey')}
              />
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-white/40">Model</span>
                <span className="block text-[11px] text-white/30 mt-0.5 mb-1.5">
                  Most self-hosted servers accept <code>whisper-1</code> regardless of the loaded weights.
                </span>
                <input type="text"
                  value={draft.hermesModel}
                  onChange={(e) => setDraft((d) => ({ ...d, hermesModel: e.target.value }))}
                  placeholder="whisper-1"
                  autoComplete="off" spellCheck={false}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm font-mono
                             placeholder-white/20 focus:outline-none focus:border-amber-400/50 transition" />
              </label>

              {/* OpenAI key still needed for grammar polish (gpt-4o-mini). */}
              <div className="pt-3 border-t border-white/5">
                <KeyField
                  label="OpenAI API Key (for grammar polish — optional)"
                  hint="Hermes transcribes; an OpenAI key is still used by the cleanup pass (gpt-4o-mini) to fix punctuation and remove filler words. Leave blank to skip cleanup."
                  placeholder="sk-proj-…"
                  value={draft.openai}
                  onChange={set('openai')}
                />
              </div>
            </div>
          )}

          <div className="pt-1 border-t border-white/5">
            <div className="text-[10px] uppercase tracking-wider text-white/25 mb-2">
              Estimated cost per transcribed word (used in Users tab)
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 inline-block">
              <div className="text-[10px] text-white/40 mb-0.5">Per audio word</div>
              <div className="text-sm font-mono text-amber-300">
                {draft.transcribeProvider === 'hermes' ? '$0.000000' : `$${COST_PER_AUDIO_WORD.toFixed(6)}`}
              </div>
              <div className="text-[10px] text-white/25 mt-0.5">
                {draft.transcribeProvider === 'hermes' ? 'Hermes self-hosted — free' : 'Whisper est.'}
              </div>
            </div>
          </div>
        </div>

        {err && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-400/20 rounded-lg px-3 py-2">
            {err}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy}
            className="px-5 py-2 rounded-xl bg-violet-500/90 hover:bg-violet-500 text-white
                       text-sm font-medium transition disabled:opacity-50">
            {busy ? 'Saving…' : 'Save keys'}
          </button>
          {saved && <span className="text-xs text-emerald-400">✓ Saved — live within seconds</span>}
        </div>
      </form>
    </div>
  );
}

function KeyField({ label, hint, placeholder, value, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-white/40">{label}</span>
      {hint && <span className="block text-[11px] text-white/30 mt-0.5 mb-1.5">{hint}</span>}
      <div className="flex items-center gap-2">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm font-mono
                     placeholder-white/20 focus:outline-none focus:border-violet-400/50 transition"
        />
        <button type="button" onClick={() => setShow((v) => !v)}
          className="shrink-0 text-xs text-white/30 hover:text-white/70 border border-white/10
                     rounded-lg px-2.5 py-2 transition hover:border-white/20">
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
    </label>
  );
}

// ── Invite modal ──────────────────────────────────────────────────────────────

function InviteModal({ onClose, onInvite }) {
  const [email,  setEmail]  = useState('');
  const [secret, setSecret] = useState(() => {
    try { return localStorage.getItem('fw_invite_key') || ''; } catch { return ''; }
  });
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState('');
  const [sent, setSent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      try { localStorage.setItem('fw_invite_key', secret.trim()); } catch { /* ignore */ }
      await onInvite(email, secret.trim());
      setSent(true);
      setTimeout(onClose, 1300);
    } catch (e2) {
      setErr(e2.message || 'Failed to send invite.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#15131f] p-6"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Invite new user</h2>
          <button type="button" onClick={onClose} className="text-white/40 hover:text-white transition">✕</button>
        </div>

        {sent ? (
          <div className="py-8 text-center text-emerald-300 text-sm">✓ Invite sent to {email}</div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-white/40">Email address</span>
              <input type="email" required autoFocus value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com"
                className="mt-1.5 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm
                           placeholder-white/25 focus:outline-none focus:border-violet-400/50 transition" />
            </label>

            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-white/40">Invite key</span>
              <input type="password" required value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="matches INVITE_SECRET in send-invite.php"
                className="mt-1.5 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm font-mono
                           placeholder-white/25 focus:outline-none focus:border-violet-400/50 transition" />
              <span className="block mt-1 text-[11px] text-white/30">
                Saved on this device. Must match <code>INVITE_SECRET</code> in send-invite.php.
              </span>
            </label>

            {err && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-400/20 rounded-lg px-3 py-2">
                {err}
              </div>
            )}

            <button type="submit" disabled={busy}
              className="w-full py-2.5 rounded-xl bg-violet-500/90 hover:bg-violet-500 text-white
                         text-sm font-medium transition disabled:opacity-50">
              {busy ? 'Sending…' : 'Send invite'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
