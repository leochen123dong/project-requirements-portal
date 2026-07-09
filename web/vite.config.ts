/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base path:
//   - GitHub Pages project page: `/<repo-name>/`
//   - Override with VITE_BASE_PATH if your repo or hosting differs
//   - Dev (npm run dev) uses '/' so direct routing works
const base = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // Don't pick up Playwright E2E specs from web/e2e/.
    exclude: ['**/node_modules/**', 'e2e/**', 'dist/**'],
  },
});
