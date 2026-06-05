// FlowWrite customer portal — the web-side equivalent of the desktop app's
// account page. Two tabs:
//   • Overview   — plan, weekly + all-time usage, upgrade / manage subscription.
//   • Templates  — full CRUD on the user's templates (mobile-friendly).
//
// Mobile-first layout. The mobile app opens this URL in an in-app browser /
// SFSafariViewController so users can manage templates without installing the
// desktop app.

import React, { useEffect, useMemo, useState } from 'react';
import { doc, collection, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, firestore, signInWithGoogle, signOut, onUser } from '../firebase.js';
import Templates from './Templates.jsx';

// ── Shared constants ──────────────────────────────────────────────────────────
const DEFAULT_LIMITS = { freeWeeklyGenerations: 50, freeWeeklyAudioWords: 2500 };

function isoWeekKey(d = new Date()) {
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86_400_000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [limits, setLimits]   = useState(DEFAULT_LIMITS);
  const [templates, setTemplates] = useState([]);
  const [authReady, setAuthReady] = useState(false);
  const [tab, setTab] = useState('overview');

  // 1. Auth state
  useEffect(() => onUser((u) => { setUser(u); setAuthReady(true); }), []);

  // 2. Profile + limits + templates — live listeners scoped to signed-in user
  useEffect(() => {
    if (!user) { setProfile(null); setTemplates([]); return undefined; }
    const offProfile = onSnapshot(
      doc(firestore, 'users', user.uid),
      (snap) => setProfile(snap.exists() ? snap.data() : null),
      () => setProfile(null),
    );
    const offLimits = onSnapshot(
      doc(firestore, 'config', 'limits'),
      (snap) => setLimits(snap.exists() ? { ...DEFAULT_LIMITS, ...snap.data() } : DEFAULT_LIMITS),
      () => {},
    );
    const offTpl = onSnapshot(
      collection(firestore, 'users', user.uid, 'templates'),
      (snap) => setTemplates(snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))),
      () => setTemplates([]),
    );
    return () => { offProfile(); offLimits(); offTpl(); };
  }, [user]);

  // 3. Auto-create the user profile on first sign-in (matches desktop behaviour
  //    so customers don't get stuck on a blank state if they reach the portal
  //    before opening the desktop app).
  useEffect(() => {
    if (!user || profile !== null) return;
    setDoc(doc(firestore, 'users', user.uid), {
      email:       user.email || '',
      displayName: user.displayName || '',
      photoURL:    user.photoURL || '',
      plan:        'free',
      status:      'active',
      createdAt:   Date.now(),
      lastSeen:    Date.now(),
    }, { merge: true }).catch(() => {});
  }, [user, profile]);

  // Template CRUD — pure Firestore writes, no IPC needed.
  async function saveTemplate(t) {
    const now = Date.now();
    const id = t.id || `tpl-${now}-${Math.random().toString(36).slice(2, 8)}`;
    const data = {
      name: '', purpose: 'Other', platform: '', content: '',
      fromName: '', signature: '', notes: '', additionalInstructions: '',
      ...t,
      id, updatedAt: now,
      createdAt: t.createdAt || now,
    };
    await setDoc(doc(firestore, 'users', user.uid, 'templates', id), data, { merge: true });
  }
  async function removeTemplate(id) {
    await deleteDoc(doc(firestore, 'users', user.uid, 'templates', id));
  }

  // ── Render gates ───────────────────────────────────────────────────────────
  if (!authReady) {
    return <div className="min-h-screen flex items-center justify-center bg-bg text-white/40 text-sm">Loading…</div>;
  }
  if (!user) return <Login />;

  const isPro = profile?.plan === 'pro' || profile?.plan === 'team';
  const wk    = isoWeekKey();
  const mo    = monthKey();
  const usage = {
    gensWeek:  profile?.usageWeekly?.[wk] || 0,
    audioWeek: profile?.audioWordsWeekly?.[wk] || 0,
    gensAll:   profile?.allTimeUsage || 0,
    audioAll:  profile?.allTimeAudioWords || 0,
    gensMonth: profile?.usage?.[mo] || 0,
  };

  return (
    <div className="min-h-screen bg-bg text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-bg/90 backdrop-blur border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-accentSoft to-accent
                           flex items-center justify-center text-xs font-bold">FW</span>
          <span className="font-semibold text-base">FlowWrite</span>
          <span className="ml-auto flex items-center gap-2 min-w-0">
            {user.photoURL && (
              <img src={user.photoURL} alt="" className="w-7 h-7 rounded-full shrink-0" referrerPolicy="no-referrer" />
            )}
            <span className="hidden sm:block text-xs text-white/40 max-w-[140px] truncate">{user.email}</span>
            <button type="button" onClick={signOut}
              className="text-xs text-white/50 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5">
              Sign out
            </button>
          </span>
        </div>

        {/* Tab bar */}
        <div className="max-w-3xl mx-auto px-4 pb-2 flex gap-1">
          <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')}>Overview</TabBtn>
          <TabBtn active={tab === 'templates'} onClick={() => setTab('templates')}>
            Templates{templates.length > 0 && (
              <span className="ml-1 text-[10px] text-white/40 font-normal">{templates.length}</span>
            )}
          </TabBtn>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {tab === 'overview' && (
          <Overview user={user} profile={profile} isPro={isPro}
            usage={usage} limits={limits} />
        )}
        {tab === 'templates' && (
          <Templates templates={templates} onSave={saveTemplate} onRemove={removeTemplate} />
        )}
      </main>
    </div>
  );
}

// ── Tab button ────────────────────────────────────────────────────────────────
function TabBtn({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className={'px-4 py-2 rounded-xl text-sm font-medium transition '
        + (active ? 'bg-accent text-white' : 'text-white/55 hover:text-white hover:bg-white/5')}>
      {children}
    </button>
  );
}

// ── Login screen ──────────────────────────────────────────────────────────────
function Login() {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function handle() {
    setErr(''); setBusy(true);
    try { await signInWithGoogle(); }
    catch (e) { setErr(e.message || 'Sign-in failed'); }
    finally { setBusy(false); }
  }
  return (
    <div className="min-h-screen bg-bg text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-accentSoft to-accent
                        flex items-center justify-center text-xl font-bold shadow-2xl shadow-accent/30">
          FW
        </div>
        <h1 className="text-2xl font-bold mb-2">Welcome to FlowWrite</h1>
        <p className="text-white/55 text-sm leading-relaxed mb-7">
          Sign in to manage your account, templates and subscription.
        </p>
        <button type="button" onClick={handle} disabled={busy}
          className="w-full py-3 rounded-xl bg-white text-[#0f0f1a] font-medium text-sm
                     hover:bg-white/90 transition flex items-center justify-center gap-3 disabled:opacity-50">
          <svg viewBox="0 0 24 24" className="w-5 h-5">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {busy ? 'Signing in…' : 'Continue with Google'}
        </button>
        {err && <p className="mt-4 text-xs text-red-400">{err}</p>}
        <p className="mt-7 text-[11px] text-white/30 leading-relaxed">
          By continuing you agree to our <a href="/terms.html" className="text-accentSoft hover:underline">Terms</a> and{' '}
          <a href="/privacy.html" className="text-accentSoft hover:underline">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────
function Overview({ user, profile, isPro, usage, limits }) {
  const checkoutUrl = `/create-checkout.php?uid=${encodeURIComponent(user.uid)}&email=${encodeURIComponent(user.email || '')}`;
  const portalUrl   = `/billing-portal.php?uid=${encodeURIComponent(user.uid)}`;

  return (
    <div className="flex flex-col gap-4">
      {/* Plan card */}
      <div className={'rounded-2xl p-5 border ' + (isPro
        ? 'bg-accent/10 border-accent/40'
        : 'bg-white/[0.04] border-white/10')}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Your plan</span>
              <span className={'text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full '
                + (isPro ? 'bg-accent text-white' : 'bg-white/10 text-white/70')}>
                {isPro ? (profile?.plan === 'team' ? 'Team' : 'Pro') : 'Free'}
              </span>
            </div>
            <p className="text-[12px] text-white/55 mt-1.5 leading-relaxed">
              {isPro
                ? 'Unlimited AI generations and voice dictation.'
                : `${limits.freeWeeklyGenerations} generations + ${limits.freeWeeklyAudioWords.toLocaleString()} dictated words each week. Resets every Monday.`}
            </p>
          </div>
          <a href={isPro ? portalUrl : checkoutUrl} target="_blank" rel="noopener"
            className={(isPro
              ? 'px-4 py-2 text-[12px] rounded-xl border border-white/15 bg-white/5 text-white/80 hover:bg-white/10'
              : 'px-5 py-2.5 text-[13px] rounded-xl bg-accent hover:bg-accent/85 text-white font-medium')
              + ' transition'}>
            {isPro ? 'Manage subscription' : 'Upgrade to Pro'}
          </a>
        </div>

        {!isPro && (
          <div className="grid grid-cols-2 gap-3 mt-5">
            <UsageBar label="AI generations" used={usage.gensWeek}  limit={limits.freeWeeklyGenerations} />
            <UsageBar label="Dictated words" used={usage.audioWeek} limit={limits.freeWeeklyAudioWords} />
          </div>
        )}
      </div>

      {/* This week */}
      <h3 className="text-[11px] uppercase tracking-wider text-white/40 mt-2">This week</h3>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="AI generations" value={usage.gensWeek}  secondary={isPro ? 'unlimited' : `of ${limits.freeWeeklyGenerations}`} accent />
        <StatCard label="Dictated words" value={usage.audioWeek} secondary={isPro ? 'unlimited' : `of ${limits.freeWeeklyAudioWords.toLocaleString()}`} accent />
      </div>

      {/* All-time */}
      <h3 className="text-[11px] uppercase tracking-wider text-white/40 mt-2">All-time</h3>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="AI generations" value={usage.gensAll} />
        <StatCard label="Dictated words" value={usage.audioAll} />
      </div>

      {/* Footer */}
      <p className="mt-6 text-[11px] text-white/30 text-center leading-relaxed">
        Need help? Email <a href="mailto:flowwrite@u11.ca" className="text-accentSoft hover:underline">flowwrite@u11.ca</a><br />
        <a href="/privacy.html" className="text-accentSoft hover:underline">Privacy</a>
        {' · '}
        <a href="/terms.html" className="text-accentSoft hover:underline">Terms</a>
      </p>
    </div>
  );
}

function UsageBar({ label, used, limit }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const over = limit > 0 && used >= limit;
  return (
    <div>
      <div className="flex items-center justify-between text-[12px] mb-1.5">
        <span className="text-white/70">{label}</span>
        <span className={'tabular-nums ' + (over ? 'text-red-300' : 'text-white/55')}>
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div className={'h-full rounded-full ' + (over ? 'bg-red-400' : 'bg-accent')}
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatCard({ label, value, secondary, accent }) {
  return (
    <div className={'rounded-2xl p-4 border ' + (accent
      ? 'bg-accent/10 border-accent/35'
      : 'bg-white/[0.04] border-white/10')}>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tabular-nums">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {secondary && <span className="text-xs text-white/40">{secondary}</span>}
      </div>
      <div className="text-[11px] uppercase tracking-wider text-white/45 mt-1">{label}</div>
    </div>
  );
}
