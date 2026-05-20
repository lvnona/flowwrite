// Idempotent helper called by the client after sign-in.
//
// Creates the /users/{uid} Firestore document on first sign-in, or refreshes
// stored profile fields (email / displayName / photoURL) on subsequent
// sign-ins so admin views stay in sync with the auth identity.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) admin.initializeApp();

export const getOrCreateUser = onCall(
  { region: 'us-central1', cors: true, memory: '128MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }

    const uid = request.auth.uid;
    const claims = request.auth.token || {};
    const email       = claims.email || '';
    const displayName = claims.name  || '';
    const photoURL    = claims.picture || '';

    const db = admin.firestore();
    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();

    if (!snap.exists) {
      await userRef.set({
        email,
        displayName,
        photoURL,
        plan: 'free',
        usage: {},
        allTimeUsage: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      // Refresh profile fields + last-seen on every login.
      await userRef.set(
        {
          email,
          displayName,
          photoURL,
          lastSeen: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    const fresh = await userRef.get();
    const out = fresh.data();
    // Strip server timestamps that don't serialize well — convert to ms.
    if (out?.createdAt?.toMillis) out.createdAt = out.createdAt.toMillis();
    if (out?.lastSeen?.toMillis)  out.lastSeen  = out.lastSeen.toMillis();
    if (out?.lastUsed?.toMillis)  out.lastUsed  = out.lastUsed.toMillis();
    return out;
  },
);
