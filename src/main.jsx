// React entry point. We branch off the `route` query param to decide what to mount:
//   - "popup"    → floating popup UI
//   - "settings" → settings page
//   - "history"  → history page
// This keeps a single Vite build producing one index.html that serves all three.

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/popup.css';

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
