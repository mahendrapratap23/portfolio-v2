import { defineConfig } from 'vite';

export default defineConfig({
  // Serve the root index.html
  root: '.',

  // Public assets (fonts, etc.)
  publicDir: 'public',

  build: {
    outDir: 'dist',
    target: 'es2023',
    // Keep JS small — no code splitting needed for a single-page portfolio
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
    // Report sizes for the 40 KB gzip budget check
    reportCompressedSize: true,
  },

  server: {
    port: 5173,
    open: false,
  },
});
