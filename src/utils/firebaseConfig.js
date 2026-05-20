// Firebase + Google OAuth configuration.
//
// FILL THESE IN after creating your Firebase project. See backend/README.md
// for step-by-step instructions.
//
// Until configured, the app boots into a "Setup needed" screen.

// 1. Firebase Web Config
//    Console → Project Settings → Your apps → Web app → Config
export const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyCMO4IhUZEIxgsQMzgVb88bNLO8P6RqD7g',
  authDomain:        'flowwrite-3ccd2.firebaseapp.com',
  projectId:         'flowwrite-3ccd2',
  storageBucket:     'flowwrite-3ccd2.firebasestorage.app',
  messagingSenderId: '276442606854',
  appId:             '1:276442606854:web:7a0c2f48e9ca3f7806c287',
};

// 2. Google "Desktop app" OAuth Client ID + Secret
//    https://console.cloud.google.com/apis/credentials → FlowWrite Desktop → Edit
//    The secret is not truly secret for Desktop apps (Google embeds it), but
//    it IS required by Google's token endpoint even when using PKCE.
export const GOOGLE_OAUTH_CLIENT_ID =
  '276442606854-gc9po3i28vtlpevr45ap6kbth5hc37mt.apps.googleusercontent.com';

export const GOOGLE_OAUTH_CLIENT_SECRET = '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';

// Helper used by the bootstrap to decide whether to show the "Setup needed"
// screen instead of trying (and failing) to talk to a non-existent project.
export function isConfigured() {
  return (
    FIREBASE_CONFIG.apiKey &&
    !FIREBASE_CONFIG.apiKey.startsWith('YOUR_') &&
    GOOGLE_OAUTH_CLIENT_ID &&
    !GOOGLE_OAUTH_CLIENT_ID.startsWith('YOUR_')
  );
}
