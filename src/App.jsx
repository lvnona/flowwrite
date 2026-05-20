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
import Settings from './pages/Settings.jsx';
import History from './pages/History.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Admin from './pages/Admin.jsx';
import Login from './pages/Login.jsx';
import Setup from './pages/Setup.jsx';

import { useAuth } from './hooks/useAuth.js';
import { isConfigured } from './utils/firebaseConfig.js';

function readRoute() {
  const params = new URLSearchParams(window.location.search);
  return params.get('route') || 'popup';
}

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const { user, loading } = useAuth();

  useEffect(() => {
    const handler = () => setRoute(readRoute());
    window.addEventListener('flowwrite:route', handler);
    window.addEventListener('popstate', handler);
    return () => {
      window.removeEventListener('flowwrite:route', handler);
      window.removeEventListener('popstate', handler);
    };
  }, []);

  // 1. Not configured yet — point the user at backend/README.md.
  if (!isConfigured()) {
    // Popup route never shows Setup; it just stays hidden. Otherwise the
    // floating popup would block the screen with a setup error.
    if (route === 'popup') return null;
    return <Setup />;
  }

  // While the Firebase SDK figures out whether the user is signed in.
  if (loading) {
    if (route === 'popup') return null;
    return <div className="page-bg flex items-center justify-center text-white/60">Loading…</div>;
  }

  // 2. Not signed in → Login (except popup, which stays hidden).
  if (!user) {
    if (route === 'popup') return null;
    return <Login />;
  }

  // 3. Signed in — render the requested page.
  if (route === 'settings')  return <Settings />;
  if (route === 'history')   return <History />;
  if (route === 'dashboard') return <Dashboard />;
  if (route === 'admin')     return <Admin />;
  return <Popup />;
}
