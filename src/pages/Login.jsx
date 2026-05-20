// First-launch Login screen. Shows a single "Sign in with Google" button
// that triggers the OAuth flow handled by the main process.

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth.js';

export default function Login() {
  const { signIn, error } = useAuth();
  const [busy, setBusy] = useState(false);

  async function handleSignIn() {
    setBusy(true);
    try {
      await signIn();
    } catch {
      // Error surfaced by the hook.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-bg flex items-center justify-center text-white">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        className="popup-card max-w-md w-full mx-6 p-10 text-center"
      >
        <div className="text-3xl mb-2">✨</div>
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Welcome to FlowWrite</h1>
        <p className="text-sm text-white/55 mb-8 leading-relaxed">
          AI writing assistant in any text field, any app.<br />
          Sign in to get started — no API keys, no setup.
        </p>

        <motion.button
          type="button"
          className="w-full bg-white text-[#1a1a2e] font-medium py-3 rounded-xl flex items-center justify-center gap-3 text-sm transition disabled:opacity-60"
          whileHover={{ scale: busy ? 1 : 1.02 }}
          whileTap={{ scale: busy ? 1 : 0.97 }}
          onClick={handleSignIn}
          disabled={busy}
        >
          <GoogleGlyph />
          {busy ? 'Opening browser…' : 'Sign in with Google'}
        </motion.button>

        {error && (
          <p className="mt-4 text-[12px] text-red-300 bg-red-500/10 border border-red-400/20 rounded-lg p-2.5">
            {error}
          </p>
        )}

        <p className="mt-8 text-[11px] text-white/35 leading-relaxed">
          You'll be taken to your browser to sign in.
          Free plan includes 30 generations / month.
        </p>
      </motion.div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
