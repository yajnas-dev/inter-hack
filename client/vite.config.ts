import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'], alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    // Same-origin in development too, so the httpOnly refresh cookie works without CORS gymnastics.
    // Point API_PROXY_TARGET at a hosted API (e.g. https://jobportal-api.onrender.com) to develop the UI against it.
    proxy: (() => {
      const target = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:5000';
      return { '/api': { target, changeOrigin: target.startsWith('https://'), secure: true } };
    })()
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Stable vendor chunks cache across deploys; role areas are split by dynamic imports in app/App.tsx.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
          forms: ['react-hook-form', '@hookform/resolvers', 'zod']
        }
      }
    }
  }
});
