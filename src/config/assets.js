/**
 * Asset manifest. Paths are relative to `public/` and resolved against
 * Vite's BASE_URL so the build works from any sub-path (e.g. GitHub Pages).
 */
const base = import.meta.env?.BASE_URL ?? './';
const url = (path) => `${base}${path}`;

/** Player poses generated from the official mascot artwork. */
export const PLAYER_POSES = Object.freeze([
  'idle',
  'jump',
  'fall',
  'crouch',
  'shoot',
  'hurt',
  'cheer',
]);

export const ASSETS = Object.freeze({
  images: {
    ...Object.fromEntries(PLAYER_POSES.map((p) => [`player.${p}`, url(`assets/sprites/${p}.png`)])),
    'brand.logo': url('assets/brand/dlicom-logo.svg'),
    'brand.icon': url('assets/brand/icon-512.png'),
  },
});
