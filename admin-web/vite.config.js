import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The admin panel is a React SPA whose HTML entry is admin.html (served at
// /admin on the host). The marketing landing page (public/index.html) is a
// static file Vite copies verbatim to dist/ — it is NOT a Vite entry.
// Build output goes into dist/ — upload that folder to the host.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'admin.html'),
    },
  },
});
