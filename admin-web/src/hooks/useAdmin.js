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

export const ADMIN_UID = 'B8npzkB2vdh2DSf52wHZfNmBSS92';

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
  });
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const isAdmin = user?.uid === ADMIN_UID;

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const q = query(collection(firestore, 'users'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setUsers(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            uid: d.id,
            ...data,
            createdAt:  data.createdAt?.toMillis?.()  ?? data.createdAt  ?? null,
            lastSeen:   data.lastSeen?.toMillis?.()   ?? data.lastSeen   ?? null,
            lastUsed:   data.lastUsed?.toMillis?.()   ?? data.lastUsed   ?? null,
            expiresAt:  data.expiresAt?.toMillis?.()  ?? data.expiresAt  ?? null,
          };
        }),
      );
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
    };
    await setDoc(API_KEYS_REF(), {
      ...trimmed,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid || null,
    }, { merge: true });
    setApiKeys(trimmed);
  }, []);

  return {
    users, loading, error, isAdmin,
    refresh: fetchUsers,
    updatePlan, updateStatus, updateExpiry, deleteUser,
    invites, inviteUser, resendInvite, deleteInvite,
    apiKeys, saveApiKeys,
  };
}
