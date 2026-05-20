// Firebase Web SDK — admin web panel.
// Uses the same FlowWrite Firebase project.
// Auth uses signInWithPopup (web flow, no PKCE needed here).

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyCMO4IhUZEIxgsQMzgVb88bNLO8P6RqD7g',
  authDomain:        'flowwrite-3ccd2.firebaseapp.com',
  projectId:         'flowwrite-3ccd2',
  storageBucket:     'flowwrite-3ccd2.firebasestorage.app',
  messagingSenderId: '276442606854',
  appId:             '1:276442606854:web:7a0c2f48e9ca3f7806c287',
};

const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);

export const auth      = getAuth(app);
export const firestore = getFirestore(app);

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  await signInWithPopup(auth, provider);
}

export async function signOut() {
  await fbSignOut(auth);
}

export function onUser(cb) {
  return onAuthStateChanged(auth, cb);
}
