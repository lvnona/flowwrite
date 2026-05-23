// Root component. Three layers of gating, in order:
//   1. Is Firebase configured at all?  → Setup screen if not
//   2. Is a user signed in?            → Login screen if not
//   3. ?route= picks the page:
//        - popup      → floating popup UI (no nav)
//        - settings   → Settings page
//        - history    → History page
//        - dashboard  → Dashboard (default for the main window)
//
// Listens for in-app route changes (pushed by NavBar) so the same window
// can flip between Dashboard / Settings / History without reloading.

import React, { useEffect, useState } from 'react';
import Popup from './components/Popup.jsx';
import DictationBar from './components/DictationBar.jsx';
import Settings from './pages/Settings.jsx';
import History from './pages/History.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Admin from './pages/Admin.jsx';
import Login from './pages/Login.jsx';
import Setup from './pages/Setup.jsx';

import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from './hooks/useAuth.js';
import { getFirebaseFirestore } from './utils/firebase.js';
import { isConfigured } from './utils/firebaseConfig.js';

// Shown in the popup window while Firebase is initialising auth state.
function PopupLoading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#16121f]/90 rounded-xl">
      <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
    </div>
  );
}

// Shown in the popup window when no user is signed in.
// Guides the user to open the main window and log in.
// When the user signs in on the main window the main process broadcasts
// auth:changed → we reload this renderer so Firebase picks up the fresh session.
function PopupSignIn() {
  useEffect(() => {
    const unsub = window.flowwrite?.onAuthChange?.((isSignedIn) => {
      if (isSignedIn) window.location.reload();
    });
    return () => unsub?.();
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-[#16121f]/95 rounded-xl border border-white/10 shadow-2xl">
      <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-xl">✦</div>
      <div className="text-center px-6">
        <p className="text-white font-semibold text-sm mb-1">Sign in to use FlowWrite</p>
        <p className="text-white/45 text-xs leading-relaxed">
          Open FlowWrite from the menu bar<br />and sign in with your account.
        </p>
      </div>
      <button
        onClick={() => window.flowwrite?.openMain?.('dashboard')}
        className="px-5 py-2 bg-accent rounded-lg text-sm font-medium text-white hover:bg-accent/80 active:scale-95 transition-all"
      >
        Open FlowWrite
      </button>
    </div>
  );
}

function readRoute() {
  const params = new URLSearchParams(window.location.search);
  return params.get('route') || 'popup';
}

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const { user, profile, loading } = useAuth();

  // Push the signed-in user's plan into the main process so it can enforce the
  // free-tier weekly limits (generations + dictation). Skip the dictation
  // window (no auth context) so it never overwrites the real plan with 'free'.
  useEffect(() => {
    if (route === 'dictation') return;
    if (!profile?.plan) return;
    window.flowwrite?.setPlan?.(profile.plan);
  }, [profile?.plan, route]);

  useEffect(() => {
    const handler = () => setRoute(readRoute());
    window.addEventListener('flowwrite:route', handler);
    window.addEventListener('popstate', handler);
    return () => {
      window.removeEventListener('flowwrite:route', handler);
      window.removeEventListener('popstate', handler);
    };
  }, []);

  // Sync admin-managed API keys from Firestore into the main process so Claude
  // generation + Whisper transcription work without customers entering keys.
  // Runs in both the main window AND the popup window (which is auth-gated so
  // the user is always signed in).  The dictation window is excluded because
  // it renders before auth and has no Firebase auth context.
  useEffect(() => {
    if (!user || !isConfigured()) return undefined;
    if (route === 'dictation') return undefined; // dictation has no auth context
    let unsub = () => {};
    try {
      const db = getFirebaseFirestore();
      unsub = onSnapshot(
        doc(db, 'config', 'apiKeys'),
        (snap) => {
          const d = snap.exists() ? snap.data() : {};
          window.flowwrite?.setApiKeys?.({
            popupProvider:    d.popupProvider    || 'claude',
            anthropic:        d.anthropic        || '',
            openaiPopup:      d.openaiPopup      || '',
            openaiPopupModel: d.openaiPopupModel || 'gpt-4o',
            deepseek:         d.deepseek         || '',
            deepseekModel:    d.deepseekModel    || 'deepseek-v4-flash',
            openai:           d.openai           || '',
          });
        },
        () => {},
      );
    } catch {
      /* ignore */
    }
    return () => unsub();
  }, [user, route]);

  // Voice dictation bar is a system-wide utility driven by the Fn key. It only
  // needs the OpenAI key (held in the main process), not Firebase/sign-in, so
  // render it before any auth gating.
  if (route === 'dictation') return <DictationBar />;

  // 1. Not configured yet — point the user at backend/README.md.
  if (!isConfigured()) {
    // Popup route never shows Setup; it just stays hidden. Otherwise the
    // floating popup would block the screen with a setup error.
    if (route === 'popup') return null;
    return <Setup />;
  }

  // While the Firebase SDK figures out whether the user is signed in.
  if (loading) {
    if (route === 'popup') return <PopupLoading />;
    return <div className="page-bg flex items-center justify-center text-white/60">Loading…</div>;
  }

  // 2. Not signed in → Login (except popup, which shows a sign-in prompt).
  if (!user) {
    if (route === 'popup') return <PopupSignIn />;
    return <Login />;
  }

  // 3. Signed in — render the requested page.
  if (route === 'settings')  return <Settings />;
  if (route === 'history')   return <History />;
  if (route === 'dashboard') return <Dashboard />;
  if (route === 'admin')     return <Admin />;
  return <Popup />;
}
