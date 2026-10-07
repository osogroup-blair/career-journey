import { execSync } from 'child_process';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import pkg from './package.json';

// Short git SHA when available (falls back to package.json's version outside
// a git checkout, e.g. some deploy contexts) — stamped onto every support
// ticket's context.appVersion (see src/types/support.ts) so triage knows
// which build a report was filed against.
function appVersion(): string {
  // Docker builds have no .git in context; the Dockerfile passes APP_VERSION instead.
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return pkg.version;
  }
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion()),
    },
    build: {
      rollupOptions: {
        // print.html is the headless-Chromium entry for PDF export (see server/pdfRenderer.ts).
        input: {
          main: path.resolve(__dirname, 'index.html'),
          print: path.resolve(__dirname, 'print.html'),
          // spotlight.html is the public Career Spotlight page (server/spotlight.ts serves it at /s/:slug).
          spotlight: path.resolve(__dirname, 'spotlight.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is controlled via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
