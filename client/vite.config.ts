import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'], alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    // Same-origin in development too, so the httpOnly refresh cookie works without CORS gymnastics.
    proxy: { '/api': { target: 'http://127.0.0.1:5000', changeOrigin: false } }
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
