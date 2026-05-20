// Hook for the admin panel — fetches all user docs and exposes plan management.
//
// Only works if the signed-in user's UID matches the admin UID in Firestore rules.
// Non-admins will get a permission-denied error when the collection query runs.

import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '../utils/firebase.js';

// UID that has admin access (must match firestore.rules isAdmin() function).
export const ADMIN_UID = 'B8npzkB2vdh2DSf52wHZfNmBSS92';

export function useAdmin(currentUser) {
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const isAdmin = currentUser?.uid === ADMIN_UID;

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const db = getFirebaseFirestore();
      const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => {
        const data = d.data();
        // Convert Firestore Timestamps to ms for easy formatting.
        return {
          uid: d.id,
          ...data,
          createdAt:  data.createdAt?.toMillis?.() ?? data.createdAt ?? null,
          lastSeen:   data.lastSeen?.toMillis?.()  ?? data.lastSeen  ?? null,
          lastUsed:   data.lastUsed?.toMillis?.()  ?? data.lastUsed  ?? null,
        };
      });
      setUsers(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const updatePlan = useCallback(async (uid, plan) => {
    const db = getFirebaseFirestore();
    await updateDoc(doc(db, 'users', uid), { plan });
    setUsers((prev) =>
      prev.map((u) => (u.uid === uid ? { ...u, plan } : u))
    );
  }, []);

  return { users, loading, error, isAdmin, refresh: fetchUsers, updatePlan };
}
