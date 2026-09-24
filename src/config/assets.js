/**
 * Asset manifest. Paths are relative to `public/` and resolved against
 * Vite's BASE_URL so the build works from any sub-path (e.g. GitHub Pages).
 */
import SPRITE_SHEETS from './spriteSheets.json';

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

/**
 * Generated animation sheets (atlas + grid metadata written by
 * tools/process_sheets.py): 12-frame jump, 8-frame spring super-jump.
 */
export { SPRITE_SHEETS };

export const ASSETS = Object.freeze({
  images: {
    ...Object.fromEntries(PLAYER_POSES.map((p) => [`player.${p}`, url(`assets/sprites/${p}.png`)])),
    ...Object.fromEntries(
      Object.entries(SPRITE_SHEETS).map(([name, s]) => [
        `sheet.${name}`,
        url(`assets/sprites/${s.file}`),
      ]),
    ),
    'brand.logo': url('assets/brand/dlicom-logo.svg'),
    'brand.icon': url('assets/brand/icon-512.png'),
  },
});
