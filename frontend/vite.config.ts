/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The SPA's version travels with its error reports (diagnostics/reporter).
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    // Fail instead of silently moving to 5174, which the API's CORS list doesn't allow.
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Playwright owns e2e/; Vitest only runs unit and component tests.
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
  },
});
