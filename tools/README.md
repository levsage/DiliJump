# Tools

| Script                     | Purpose                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase-healthcheck.mjs` | Checks a real Supabase project is set up correctly for the live leaderboard (`npm run check:supabase`, or the "Supabase health check" Action) |
| `process_sprites.py`       | Converts pose renders in `art/poses/` into transparent, uniformly scaled game sprites (`npm run sprites`)                                     |
| `process_sheets.py`        | Slices the animation sheets in `art/sheets/` (12-frame jump, 8-frame spring) into WebP atlases (`npm run sprites:sheets`)                     |

Python requirements: see `requirements.txt`.
