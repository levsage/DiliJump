/**
 * Asset manifest. Paths are relative to `public/` and resolved against
 * Vite's BASE_URL so the build works from any sub-path (e.g. GitHub Pages).
 *
 * Player artwork is per skin (see ./skins.js): the equipped skin is loaded at
 * boot together with small previews of the others; a newly equipped skin is
 * loaded on demand.
 */
const base = import.meta.env?.BASE_URL ?? './';
const url = (path) => `${base}${path}`;

export const ASSETS = Object.freeze({
  images: {
    'brand.logo': url('assets/brand/dlicom-logo.svg'),
    'brand.icon': url('assets/brand/icon-512.png'),
  },
});
