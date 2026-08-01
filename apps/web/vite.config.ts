import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@flow/contracts': `${root}/packages/contracts/src/index.ts`,
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/v1': 'http://127.0.0.1:4010',
      '/health': 'http://127.0.0.1:4010',
    },
  },
});
