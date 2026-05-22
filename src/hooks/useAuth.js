// Hook providing the current Firebase user (or null when signed out) plus
// the user's Firestore profile doc (plan, monthly usage, etc.).
//
// Architecture A (no Blaze):
//   No Cloud Functions.  On first sign-in this hook creates the /users/{uid}
//   doc directly from the client.  Firestore security rules allow the owner
//   to create their own doc (plan must start as 'free') and to update
//   profile fields / usage counters — but never to change plan.
//
// State shape
//   { user, profile, loading, error, signIn, signOut }

import { useCallback, useEffect, useState } from 'react';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import {
  getFirebaseFirestore,
  signInWithGoogle as fbSignInWithGoogle,
  signOut as fbSignOut,
  onUser,
} from '../utils/firebase.js';
import { GOOGLE_OAUTH_CLIENT_ID, isConfigured } from '../utils/firebaseConfig.js';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Listen to Firebase auth state changes.
  useEffect(() => {
    if (!isConfigured()) {
      setLoading(false);
      return;
    }
    let off = null;
    try {
      off = onUser((u) => {
        setUser(u || null);
        setLoading(false);
        // Tell the main process auth changed so it can notify other windows
        // (e.g. the popup, which runs in a separate renderer process and won't
        // receive Firebase's onAuthStateChanged cross-process on its own).
        window.flowwrite?.notifyAuthChange?.(!!u);
      });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
    return () => off?.();
  }, []);

  // When a user signs in: ensure their /users/{uid} doc exists then subscribe
  // to it for live updates (plan / usage changes from any other session).
  useEffect(() => {
    if (!user || !isConfigured()) {
      setProfile(null);
      return;
    }

    let unsub = null;
    let cancelled = false;

    (async () => {
      try {
        const db = getFirebaseFirestore();
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
          // First ever sign-in — create the doc.
          await setDoc(userRef, {
            email: user.email || '',
            displayName: user.displayName || '',
            photoURL: user.photoURL || '',
            plan: 'free',
            status: 'active',
            expiresAt: null,
            usage: {},
            allTimeUsage: 0,
            createdAt: serverTimestamp(),
            lastSeen: serverTimestamp(),
          });
        } else {
          // Refresh profile info on every login.
          await updateDoc(userRef, {
            email: user.email || '',
            displayName: user.displayName || '',
            photoURL: user.photoURL || '',
            lastSeen: serverTimestamp(),
          });
        }

        if (cancelled) return;

        // Live-subscribe so usage counters update in the Dashboard without a reload.
        unsub = onSnapshot(userRef, (s) => {
          setProfile(s.exists() ? s.data() : null);
        });
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [user]);

  const signIn = useCallback(async () => {
    setError(null);
    try {
      await fbSignInWithGoogle(GOOGLE_OAUTH_CLIENT_ID);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    try {
      await fbSignOut();
    } catch (err) {
      setError(err.message);
    }
  }, []);

  return { user, profile, loading, error, signIn, signOut };
}
