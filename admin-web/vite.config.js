import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// This project bundles TWO React SPAs:
//   • admin.html  → /admin   — admin dashboard (restricted to admins).
//   • app.html    → /app     — customer portal: every signed-in user sees
//                              their own plan, usage and templates manager.
//                              Mobile users open this from inside the app.
// The marketing landing page (public/index.html) is a static file Vite copies
// verbatim to dist/ — it is NOT a Vite entry.
// Build output goes into dist/ — upload that folder to the host.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        admin: resolve(__dirname, 'admin.html'),
        app:   resolve(__dirname, 'app.html'),
      },
    },
  },
});
