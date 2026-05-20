import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Build output goes into dist/ — upload this folder to HostArmada.
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
