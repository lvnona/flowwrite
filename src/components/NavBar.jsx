// Top navigation bar for the in-app pages (Dashboard / History / Settings / Admin).
// The Admin tab is only shown when the signed-in user is the admin UID.

import React from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { ADMIN_UID } from '../hooks/useAdmin.js';
import logoUrl from '../assets/logo.png';

const BASE_TABS = [
  { route: 'dashboard', label: 'Dashboard' },
  { route: 'history',   label: 'History' },
  { route: 'settings',  label: 'Settings' },
];

const ADMIN_TAB = { route: 'admin', label: '⚙ Admin' };

function go(route) {
  const url = new URL(window.location.href);
  url.searchParams.set('route', route);
  window.history.replaceState({}, '', url);
  window.dispatchEvent(new Event('flowwrite:route'));
}

export default function NavBar({ active }) {
  const { user } = useAuth();
  const isAdmin = user?.uid === ADMIN_UID;
  const tabs = isAdmin ? [...BASE_TABS, ADMIN_TAB] : BASE_TABS;

  return (
    <div className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-2.5">
        <img
          src={logoUrl}
          alt="FlowWrite"
          className="w-9 h-9 select-none"
          draggable={false}
        />
        <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-[#a99dff] via-[#8a82ff] to-[#6c63ff] bg-clip-text text-transparent">
          FlowWrite
        </span>
      </div>
      <nav className="flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-full p-1">
        {tabs.map((t) => {
          const isActive = t.route === active;
          return (
            <button
              key={t.route}
              type="button"
              onClick={() => go(t.route)}
              className={
                'px-4 py-1.5 rounded-full text-xs font-medium transition ' +
                (isActive
                  ? 'bg-accent/30 text-white border border-accent/50'
                  : 'text-white/55 hover:text-white hover:bg-white/5 border border-transparent')
              }
            >
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
