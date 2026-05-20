import React, { useEffect, useState } from 'react';
import { onUser } from './firebase.js';
import Login from './pages/Login.jsx';
import AdminPanel from './pages/Admin.jsx';

export default function App() {
  const [user,    setUser]    = useState(undefined); // undefined = loading
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onUser((u) => {
      setUser(u || null);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/40">
        Loading…
      </div>
    );
  }

  return user ? <AdminPanel user={user} /> : <Login />;
}
