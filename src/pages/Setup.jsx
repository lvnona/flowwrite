// Shown when Firebase isn't configured yet. Gives the user a clear next step
// instead of crashing the app with an opaque "auth failed" error.

import React from 'react';
import { motion } from 'framer-motion';

export default function Setup() {
  return (
    <div className="page-bg flex items-center justify-center text-white">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="popup-card max-w-xl w-full mx-6 p-10"
      >
        <div className="flex items-center gap-2 text-2xl mb-3">
          <span>⚙️</span>
          <h1 className="text-xl font-semibold tracking-tight">Setup needed</h1>
        </div>
        <p className="text-sm text-white/65 leading-relaxed mb-6">
          FlowWrite needs to be wired up to your Firebase project before it can
          run. Step-by-step instructions are in <code className="kbd">backend/README.md</code>.
        </p>

        <ol className="text-sm text-white/70 leading-relaxed space-y-2 list-decimal list-inside mb-6">
          <li>Create a Firebase project at <code className="kbd">console.firebase.google.com</code>.</li>
          <li>Enable Authentication (Google), Firestore, and Cloud Functions.</li>
          <li>Create a "Desktop app" OAuth client in Google Cloud Console.</li>
          <li>Paste the config values into <code className="kbd">src/utils/firebaseConfig.js</code>.</li>
          <li>From <code className="kbd">backend/</code>: <code className="kbd">firebase deploy --only firestore:rules,functions</code>.</li>
          <li>Restart the app.</li>
        </ol>

        <p className="text-[12px] text-white/45">
          Need to make changes? Edit <code className="kbd">src/utils/firebaseConfig.js</code>
          and re-launch the app.
        </p>
      </motion.div>
    </div>
  );
}
