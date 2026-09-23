import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  // Relative base so the build works on GitHub Pages (/DiliJump/) and any static host.
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
    sourcemap: true,
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
