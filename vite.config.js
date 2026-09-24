import { defineConfig, loadEnv } from 'vite';
import { readFileSync } from 'node:fs';
import { cspMeta } from './tools/vite/csp.js';
import { serviceWorker } from './tools/vite/serviceWorker.js';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** Loud build warning when a hosted build would silently fall back to the offline board. */
function warnMissingSupabaseEnv() {
  return {
    name: 'dilijump-supabase-env-check',
    apply: 'build',
    configResolved(config) {
      const env = loadEnv(config.mode, process.cwd(), 'VITE_');
      const hosted = process.env.VERCEL || process.env.CI;
      const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
      if (hosted && (!env.VITE_SUPABASE_URL || !key)) {
        config.logger.warn(
          '\n⚠️  VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are not set.\n' +
            '   This build will use the OFFLINE leaderboard (this device only).\n' +
            '   Vercel: Project → Settings → Environment Variables, then Redeploy.\n',
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [warnMissingSupabaseEnv(), cspMeta(), serviceWorker()],
  // Relative base: the same build works on Vercel (/), GitHub Pages (/DiliJump/) and any static host.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'static', // keep bundled JS/CSS separate from public/assets
    target: 'es2020',
    // no public source maps in production (the repo is the source of truth)
    sourcemap: false,
    rollupOptions: {
      output: {
        // supabase-js is lazy-loaded; give its chunk a readable name.
        manualChunks: (id) => (id.includes('node_modules/@supabase') ? 'supabase' : undefined),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    globals: false,
  },
});
