import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { firestore, auth } from '../firebase.js';

// Firestore document that holds the admin-managed API keys.
const API_KEYS_REF = () => doc(firestore, 'config', 'apiKeys');
// Server-side billing + email config (Stripe, SMTP, URLs). Admin-only.
const BILLING_REF = () => doc(firestore, 'config', 'billing');
// Free-plan weekly limits — readable by every signed-in user.
const LIMITS_REF = () => doc(firestore, 'config', 'limits');

const LIMITS_DEFAULTS = {
  freeWeeklyGenerations: 50,
  freeWeeklyAudioWords: 2500,
};

const BILLING_DEFAULTS = {
  stripe_secret_key: '',
  stripe_price_id: '',
  stripe_webhook_secret: '',
  site_url: 'https://flowwrite.u11.ca',
  success_url: 'https://flowwrite.u11.ca/thank-you.html',
  cancel_url: 'https://flowwrite.u11.ca/?cancelled=1',
  return_url: 'https://flowwrite.u11.ca/',
  smtp_host: 'mail.u11.ca',
  smtp_port: 465,
  smtp_user: 'flowwrite@u11.ca',
  smtp_pass: '',
  from_email: 'flowwrite@u11.ca',
  from_name: 'FlowWrite',
  owner_notify: '',
  invite_secret: '',
};

// Permanent super-admin (lvnona@gmail.com). Hardcoded so no one can ever lock
// the owner out, and only this account can edit the admin list. Additional
// admins are stored in Firestore (config/admins) and managed from the panel.
export const ADMIN_UID = 'B8npzkB2vdh2DSf52wHZfNmBSS92';
const ADMINS_REF = () => doc(firestore, 'config', 'admins');

// ISO-week key (e.g. "2026-W21") — must match the key the app reads/writes for
// weekly usage counters, so resetting here actually clears the live count.
function isoWeekKey(d = new Date()) {
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86_400_000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// PHP mailer (same origin on HostArmada) + the landing page invite links open.
const SEND_INVITE_URL = '/send-invite.php';
const WELCOME_URL = 'https://flowwrite.u11.ca/welcome.html';

export function useAdmin(user) {
  const [users,   setUsers]   = useState([]);
  const [invites, setInvites] = useState([]);
  const [apiKeys, setApiKeys] = useState({
    popupProvider:    'claude',
    anthropic:        '',
    openaiPopup:      '',
    openaiPopupModel: 'gpt-4o',
    deepseek:         '',
    deepseekModel:    'deepseek-v4-flash',
    openai:           '',
    // ── Transcription (audio → text) ──────────────────────────────────────
    // Which provider every platform uses for voice dictation. "openai" =
    // hosted Whisper API. "hermes" = a self-hosted OpenAI-compatible Whisper
    // endpoint (e.g. our Hermes/faster-whisper server).
    transcribeProvider: 'openai',
    hermesUrl:          '',   // e.g. http://144.126.146.220:8000/v1
    hermesKey:          '',
    hermesModel:        'whisper-1',  // most self-hosted servers accept this
  });
  const [billing, setBilling] = useState(BILLING_DEFAULTS);
  const [limits, setLimits] = useState(LIMITS_DEFAULTS);
  const [adminUids, setAdminUids] = useState([]);
  const [adminsLoaded, setAdminsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const isSuperAdmin = user?.uid === ADMIN_UID;
  const isAdmin = isSuperAdmin || (!!user && adminUids.includes(user.uid));
  // True once we know whether this user is an admin (super-admin is instant;
  // additional admins resolve after the config/admins read).
  const adminResolved = isSuperAdmin || adminsLoaded;

  // Resolve the admin list. Not gated on isAdmin (chicken-and-egg): a real
  // additional admin can read config/admins via the rule; a non-admin's read is
  // denied → treated as "not an admin".
  const fetchAdmins = useCallback(async () => {
    if (!user) { setAdminsLoaded(true); return; }
    try {
      const snap = await getDoc(ADMINS_REF());
      setAdminUids(snap.exists() ? (snap.data().uids || []) : []);
    } catch {
      setAdminUids([]);
    } finally {
      setAdminsLoaded(true);
    }
  }, [user]);

  useEffect(() => { fetchAdmins(); }, [fetchAdmins]);

  // Add / remove an additional admin (super-admin only — enforced by rules).
  const addAdmin = useCallback(async (uid) => {
    const clean = (uid || '').trim();
    if (!clean) throw new Error('Missing user id.');
    if (clean === ADMIN_UID) throw new Error('That account is already the super-admin.');
    const next = Array.from(new Set([...adminUids, clean]));
    await setDoc(ADMINS_REF(), {
      uids: next, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.uid || null,
    }, { merge: true });
    setAdminUids(next);
  }, [adminUids]);

  const removeAdmin = useCallback(async (uid) => {
    const next = adminUids.filter((u) => u !== uid);
    await setDoc(ADMINS_REF(), {
      uids: next, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.uid || null,
    }, { merge: true });
    setAdminUids(next);
  }, [adminUids]);

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      // IMPORTANT: do NOT use orderBy('createdAt') here. Firestore silently
      // excludes any document missing that field, which hid users created by
      // clients that didn't write createdAt (e.g. earlier iOS builds). Fetch
      // the whole collection and sort client-side so EVERY user shows, even
      // free users and docs with missing/legacy fields.
      const snap = await getDocs(collection(firestore, 'users'));
      const list = snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          ...data,
          createdAt:  data.createdAt?.toMillis?.()  ?? data.createdAt  ?? null,
          lastSeen:   data.lastSeen?.toMillis?.()   ?? data.lastSeen   ?? null,
          lastUsed:   data.lastUsed?.toMillis?.()   ?? data.lastUsed   ?? null,
          expiresAt:  data.expiresAt?.toMillis?.()  ?? data.expiresAt  ?? null,
        };
      });
      // Newest first; users without a createdAt sort to the bottom.
      list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      setUsers(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Sent-invite history (admin-only collection).
  const fetchInvites = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const q = query(collection(firestore, 'invites'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setInvites(
        snap.docs.map((d) => {
          const data = d.data();
          return { id: d.id, ...data, createdAt: data.createdAt?.toMillis?.() ?? null };
        }),
      );
    } catch {
      /* non-fatal — invites list just stays empty */
    }
  }, [isAdmin]);

  useEffect(() => { fetchInvites(); }, [fetchInvites]);

  // Send (or re-send) an invite email via the PHP endpoint.
  const sendInviteEmail = useCallback(async (email, secret) => {
    const res = await fetch(SEND_INVITE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, link: WELCOME_URL, secret: secret || '' }),
    });
    let payload = {};
    try { payload = await res.json(); } catch { /* ignore */ }
    if (!res.ok || payload.error) {
      throw new Error(payload.error || `Email failed (HTTP ${res.status}).`);
    }
  }, []);

  // Invite a new user: send the email via the PHP endpoint, then record it.
  const inviteUser = useCallback(async (email, secret) => {
    const clean = (email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      throw new Error('Please enter a valid email address.');
    }
    await sendInviteEmail(clean, secret);
    // Record it for history (best-effort — the email already went out).
    try {
      await addDoc(collection(firestore, 'invites'), {
        email: clean,
        status: 'sent',
        invitedBy: auth.currentUser?.uid || null,
        invitedByEmail: auth.currentUser?.email || null,
        createdAt: serverTimestamp(),
      });
      await fetchInvites();
    } catch { /* recording is best-effort */ }
  }, [fetchInvites, sendInviteEmail]);

  // Re-send invite to an already-recorded address.
  const resendInvite = useCallback(async (invite, secret) => {
    await sendInviteEmail(invite.email, secret);
    // Update the record's timestamp and status.
    try {
      await updateDoc(doc(firestore, 'invites', invite.id), {
        status: 'resent',
        createdAt: serverTimestamp(),
      });
      await fetchInvites();
    } catch { /* best-effort */ }
  }, [fetchInvites, sendInviteEmail]);

  // Delete an invite record.
  const deleteInvite = useCallback(async (id) => {
    await deleteDoc(doc(firestore, 'invites', id));
    setInvites((prev) => prev.filter((i) => i.id !== id));
  }, []);

  // Change plan (free | pro | team).
  const updatePlan = useCallback(async (uid, plan) => {
    await updateDoc(doc(firestore, 'users', uid), { plan });
    setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, plan } : u)));
  }, []);

  // Toggle active / suspended.
  const updateStatus = useCallback(async (uid, status) => {
    await updateDoc(doc(firestore, 'users', uid), { status });
    setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, status } : u)));
  }, []);

  // Set subscription expiry date (pass null to clear).
  const updateExpiry = useCallback(async (uid, isoDate) => {
    const expiresAt = isoDate ? Timestamp.fromDate(new Date(isoDate)) : null;
    await updateDoc(doc(firestore, 'users', uid), { expiresAt });
    const ms = expiresAt ? expiresAt.toMillis() : null;
    setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, expiresAt: ms } : u)));
  }, []);

  // Reset the CURRENT week's free-tier usage counters (popup generations +
  // dictated words) for every free user — i.e. give them a fresh weekly
  // allowance immediately, without waiting for the Monday auto-reset.
  // Returns the number of users affected.
  const resetFreeWeeklyUsage = useCallback(async () => {
    const week = isoWeekKey();
    const targets = users.filter((u) => (u.plan || 'free') === 'free');
    await Promise.all(targets.map((u) =>
      updateDoc(doc(firestore, 'users', u.uid), {
        [`usageWeekly.${week}`]: 0,
        [`audioWordsWeekly.${week}`]: 0,
      }),
    ));
    setUsers((prev) => prev.map((u) => ((u.plan || 'free') === 'free'
      ? {
          ...u,
          usageWeekly: { ...(u.usageWeekly || {}), [week]: 0 },
          audioWordsWeekly: { ...(u.audioWordsWeekly || {}), [week]: 0 },
        }
      : u)));
    return targets.length;
  }, [users]);

  // Reset a single user's current-week usage counters.
  const resetUserWeeklyUsage = useCallback(async (uid) => {
    const week = isoWeekKey();
    await updateDoc(doc(firestore, 'users', uid), {
      [`usageWeekly.${week}`]: 0,
      [`audioWordsWeekly.${week}`]: 0,
    });
    setUsers((prev) => prev.map((u) => (u.uid === uid
      ? {
          ...u,
          usageWeekly: { ...(u.usageWeekly || {}), [week]: 0 },
          audioWordsWeekly: { ...(u.audioWordsWeekly || {}), [week]: 0 },
        }
      : u)));
  }, []);

  // Re-fetch a user's Stripe subscription and update their Firestore record.
  // Useful for backfilling currentPeriodEnd when the webhook missed it or
  // wrote 0 (e.g. Stripe 2026 API moved the field onto subscription items).
  const resyncStripe = useCallback(async (uid, secret) => {
    const res = await fetch('/admin-resync-stripe.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, secret: secret || '' }),
    });
    let payload = {};
    try { payload = await res.json(); } catch { /* ignore */ }
    if (!res.ok || payload.error) {
      throw new Error(payload.error || `Resync failed (HTTP ${res.status}).`);
    }
    // Reflect the updated values locally so the UI refreshes immediately.
    setUsers((prev) => prev.map((u) => (u.uid === uid
      ? { ...u,
          plan: payload.plan || u.plan,
          subscriptionStatus: payload.subscriptionStatus || u.subscriptionStatus,
          currentPeriodEnd: payload.currentPeriodEnd ?? u.currentPeriodEnd }
      : u)));
    return payload;
  }, []);

  // Delete the user's Firestore record entirely.
  const deleteUser = useCallback(async (uid) => {
    await deleteDoc(doc(firestore, 'users', uid));
    setUsers((prev) => prev.filter((u) => u.uid !== uid));
  }, []);

  // ── API keys (admin-managed, stored in config/apiKeys) ────────────────────

  const fetchApiKeys = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const snap = await getDoc(API_KEYS_REF());
      if (snap.exists()) {
        const d = snap.data();
        setApiKeys({
          popupProvider:    d.popupProvider    || 'claude',
          anthropic:        d.anthropic        || '',
          openaiPopup:      d.openaiPopup      || '',
          openaiPopupModel: d.openaiPopupModel || 'gpt-4o',
          deepseek:         d.deepseek         || '',
          deepseekModel:    d.deepseekModel    || 'deepseek-v4-flash',
          openai:           d.openai           || '',
          transcribeProvider: d.transcribeProvider || 'openai',
          hermesUrl:          d.hermesUrl          || '',
          hermesKey:          d.hermesKey          || '',
          hermesModel:        d.hermesModel        || 'whisper-1',
        });
      }
    } catch { /* non-fatal */ }
  }, [isAdmin]);

  useEffect(() => { fetchApiKeys(); }, [fetchApiKeys]);

  const saveApiKeys = useCallback(async (keys) => {
    const trimmed = {
      popupProvider:    (keys.popupProvider    || 'claude').trim(),
      anthropic:        (keys.anthropic        || '').trim(),
      openaiPopup:      (keys.openaiPopup      || '').trim(),
      openaiPopupModel: (keys.openaiPopupModel || 'gpt-4o').trim(),
      deepseek:         (keys.deepseek         || '').trim(),
      deepseekModel:    (keys.deepseekModel    || 'deepseek-v4-flash').trim(),
      openai:           (keys.openai           || '').trim(),
      transcribeProvider: (keys.transcribeProvider || 'openai').trim(),
      hermesUrl:          (keys.hermesUrl          || '').trim(),
      hermesKey:          (keys.hermesKey          || '').trim(),
      hermesModel:        (keys.hermesModel        || 'whisper-1').trim(),
    };
    await setDoc(API_KEYS_REF(), {
      ...trimmed,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid || null,
    }, { merge: true });
    setApiKeys(trimmed);
  }, []);

  // ── Billing + email config (admin-managed, stored in config/billing) ──────

  const fetchBilling = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const snap = await getDoc(BILLING_REF());
      if (snap.exists()) {
        setBilling({ ...BILLING_DEFAULTS, ...snap.data() });
      }
    } catch { /* non-fatal */ }
  }, [isAdmin]);

  useEffect(() => { fetchBilling(); }, [fetchBilling]);

  const saveBilling = useCallback(async (cfg) => {
    const out = { ...BILLING_DEFAULTS, ...cfg };
    // Normalise types: port is an integer; trim strings.
    out.smtp_port = parseInt(out.smtp_port, 10) || 465;
    Object.keys(out).forEach((k) => {
      if (typeof out[k] === 'string') out[k] = out[k].trim();
    });
    await setDoc(BILLING_REF(), {
      ...out,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid || null,
    }, { merge: true });
    setBilling(out);
  }, []);

  // ── Free-plan weekly limits ─────────────────────────────────────────────

  const fetchLimits = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const snap = await getDoc(LIMITS_REF());
      if (snap.exists()) setLimits({ ...LIMITS_DEFAULTS, ...snap.data() });
    } catch { /* non-fatal */ }
  }, [isAdmin]);

  useEffect(() => { fetchLimits(); }, [fetchLimits]);

  const saveLimits = useCallback(async (next) => {
    const out = {
      freeWeeklyGenerations: Math.max(0, parseInt(next.freeWeeklyGenerations, 10) || 0),
      freeWeeklyAudioWords:  Math.max(0, parseInt(next.freeWeeklyAudioWords,  10) || 0),
    };
    await setDoc(LIMITS_REF(), {
      ...out, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.uid || null,
    }, { merge: true });
    setLimits(out);
  }, []);

  return {
    users, loading, error, isAdmin, isSuperAdmin, adminResolved,
    adminUids, addAdmin, removeAdmin,
    refresh: fetchUsers,
    updatePlan, updateStatus, updateExpiry, deleteUser,
    resetFreeWeeklyUsage, resetUserWeeklyUsage,
    resyncStripe,
    invites, inviteUser, resendInvite, deleteInvite,
    apiKeys, saveApiKeys,
    billing, saveBilling,
    limits, saveLimits,
  };
}
