import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { firestore } from '../firebase.js';

export const ADMIN_UID = 'B8npzkB2vdh2DSf52wHZfNmBSS92';

export function useAdmin(user) {
  const [users,   setUsers]   = useState([]);
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

  return {
    users, loading, error, isAdmin,
    refresh: fetchUsers,
    updatePlan, updateStatus, updateExpiry, deleteUser,
  };
}
