import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Honor an assigned PORT (lets parallel dev servers / preview tooling pick a free
  // port); falls back to the canonical 5174 for a plain `pnpm dev:admin`.
  server: { port: Number(process.env.PORT) || 5174, strictPort: true },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
