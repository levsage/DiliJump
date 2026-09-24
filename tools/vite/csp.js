/**
 * Content Security Policy — single source of truth.
 *
 * - Vercel sends it as an HTTP header (vercel.json, + frame-ancestors).
 * - Every production build also embeds it as a <meta> tag, so static hosts
 *   that can't set headers (GitHub Pages) are protected too.
 *
 * tests/csp.test.js fails if vercel.json drifts from this file.
 */
export const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'"],
  // Supabase REST (leaderboard) + realtime websocket. Nothing else leaves the page.
  'connect-src': ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co'],
  'worker-src': ["'self'"],
  'manifest-src': ["'self'"],
  'media-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
};

/** Header-only directives (ignored — with a console warning — inside <meta>). */
export const CSP_HEADER_ONLY = {
  'frame-ancestors': ["'self'"],
};

const serialize = (d) =>
  Object.entries(d)
    .map(([k, v]) => `${k} ${v.join(' ')}`)
    .join('; ');

export const CSP_META = serialize(CSP_DIRECTIVES);
export const CSP_HEADER = serialize({ ...CSP_DIRECTIVES, ...CSP_HEADER_ONLY });

/** Vite plugin: inject the CSP <meta> into index.html for production builds. */
export function cspMeta() {
  return {
    name: 'dilijump-csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      // right after <meta charset>, before anything that loads resources
      handler: (html) =>
        html.replace(
          /(<meta charset="[^"]*"\s*\/?>)/i,
          `$1\n    <meta http-equiv="Content-Security-Policy" content="${CSP_META}" />`,
        ),
    },
  };
}
