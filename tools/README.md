# Tools

| Script                     | Purpose                                                                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase-healthcheck.mjs` | Checks a real Supabase project is set up correctly for the live leaderboard (`npm run check:supabase`, or the "Supabase health check" Action)       |
| `process_sprites.py`       | Converts pose renders in `art/poses/` into transparent, uniformly scaled WebP sprites; only the poses the game uses are written (`npm run sprites`) |
| `vite/csp.js`              | Content Security Policy (single source) + Vite plugin injecting it as `<meta>` into production builds                                               |
| `vite/serviceWorker.js`    | Vite plugin generating `dist/sw.js` (precache list + offline strategy) at build time                                                                |
| `og/render.mjs`            | Renders `og/og-image.html` into the social preview card `public/og-image.jpg` (`npm run og-image`)                                                  |
| `process_sheets.py`        | Slices the animation sheets in `art/sheets/` (12-frame jump, 8-frame spring) into WebP atlases (`npm run sprites:sheets`)                           |

Python requirements: see `requirements.txt`.
