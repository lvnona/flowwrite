// Firebase Web SDK initialisation — used by both the main app window and the
// floating popup window. Both windows load the same Vite bundle so they share
// this single Firebase app instance + its IndexedDB auth persistence (Electron
// BrowserWindows share the default partition).

import { initializeApp, getApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  signOut as fbSignOut,
  onAuthStateChanged,
  browserLocalPersistence,
  setPersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import {
  FIREBASE_CONFIG,
  GOOGLE_OAUTH_CLIENT_SECRET,
  isConfigured,
} from './firebaseConfig.js';

let _app = null;
let _auth = null;
let _firestore = null;

function ensureApp() {
  if (!isConfigured()) {
    throw new Error(
      'Firebase is not configured. Edit src/utils/firebaseConfig.js — see backend/README.md.',
    );
  }
  if (_app) return _app;
  _app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
  return _app;
}

export function getFirebaseApp() {
  return ensureApp();
}

export function getFirebaseAuth() {
  if (_auth) return _auth;
  _auth = getAuth(ensureApp());
  // Ensure auth state survives app restarts. Default is already local
  // persistence in the browser SDK but we set it explicitly so it's
  // documented and obvious.
  setPersistence(_auth, browserLocalPersistence).catch(() => {});
  return _auth;
}

export function getFirebaseFirestore() {
  if (_firestore) return _firestore;
  _firestore = getFirestore(ensureApp());
  return _firestore;
}

// ─── Sign-in flow ──────────────────────────────────────────────────────────

/**
 * Sign in via Google. The OAuth dance happens in the main process (see
 * electron/auth.js). We just hand the resulting id_token to Firebase.
 */
export async function signInWithGoogle(googleClientId) {
  const result = await window.flowwrite?.googleSignIn?.({
    clientId: googleClientId,
    clientSecret: GOOGLE_OAUTH_CLIENT_SECRET,
  });
  if (!result?.ok) {
    throw new Error(result?.error || 'Sign-in failed.');
  }
  const credential = GoogleAuthProvider.credential(result.idToken, result.accessToken);
  const auth = getFirebaseAuth();
  const cred = await signInWithCredential(auth, credential);
  return cred.user;
}

export async function signOut() {
  await fbSignOut(getFirebaseAuth());
}

// ─── Subscriptions ─────────────────────────────────────────────────────────

export function onUser(cb) {
  return onAuthStateChanged(getFirebaseAuth(), cb);
}

// Architecture A: no Cloud Functions. The desktop app talks directly to
// Firebase Auth and Firestore. Claude is called from the Electron main
// process via the `generate-text` IPC channel (see electron/main.js).
