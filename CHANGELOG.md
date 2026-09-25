# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [2.2.0] - 2026-09-25

### Added

- **Player levels.** Every point you score is XP and all your runs add up — even the ones that don't beat your best. The level keeps rising (each level costs 500 XP more than the last: Lv 2 at 1 000, Lv 3 at 2 500, Lv 5 at 7 000, Lv 10 at 27 000).
  - **Lv badge next to every name on the leaderboard**, visible to everyone.
  - Level + XP bar on the main menu, level badge in the HUD name bar.
  - Game over shows "+score XP" and a **LEVEL UP!** banner with a jingle.
  - Existing players keep everything they've already scored: their XP is back-filled from their whole run history.
- Database migration `20260925120000_player_levels.sql` (`players.total_score`, `player_level()`; `submit_score`, `get_leaderboard` and `get_player_rank` return `total_score` + `level`). Backward compatible in both directions. SQL tests in `supabase/tests/levels_test.sql`; the health check verifies it.

### Changed

- **3-pose jump** (was 30 frames): squat → rising → falling, picked from the generated art. The jump sheet shrank from 267 KB to 26 KB.
- Offline runs are all kept and synced (up to 30) instead of only the best one, so no XP is lost.

## [2.1.0] - 2026-09-25

### Added

- **Solid side walls.** Glowing walls on both sides of the playfield: the mascot can no longer slip off one edge and reappear on the other. Bumping into a wall gives a little dust puff, a glow and a soft thud. Moving platforms and monsters bounce off the walls, and levels are generated between them.

### Changed

- **30-frame jump animation** (was 12): a newly generated, smoother cycle — touch-down, deep squat, push-off, rising, a joyful apex, floating hang, cape billowing up while falling and legs reaching for the next platform. Every frame is shown on every normal jump, driven by the real jump physics.
- `tools/process_sheets.py` can slice sheets by grid, even where neighbouring poses touch.

### Removed

- Screen wrap-around (replaced by the walls).

## [2.0.0] - 2026-09-24

The first production release: everything from the unreleased 1.3 line (new animation, controls and music) plus a hardened, installable, offline-capable build.

### Added

- **Plays offline & installs like an app.** A service worker (generated at build time) precaches the game, so after the first visit DiliJump loads instantly and works with no connection. Scores made offline sync when you're back online.
- **"New version ready" prompt.** When a new deploy is available the menu offers a one-tap reload — never in the middle of a run.
- **Link previews.** Open Graph / Twitter card image and tags, so shared links show a proper DiliJump card on WhatsApp, Facebook, X, Discord and Telegram.
- **Branded 404 page** and richer web-app manifest / iOS home-screen tags.
- **Crash protection.** A failing frame no longer freezes the game: it is logged once and the loop keeps running; a persistent failure shows a friendly "Reload" screen (coins and best score are safe). Images are retried before giving up.
- **End-to-end tests.** Playwright smoke tests (mobile + desktop) run against the real production build in CI: menu, play, controls, pause, leaderboard, service worker, offline reload, CSP and the 404 page.

- **12-frame jump animation.** Newly generated frames (landing squat, push-off, rising, apex, falling, ready-to-land), driven by the real jump physics so they always match the arc.
- **On-screen ◀ ▶ buttons** for easy play on phones and with a mouse: hold to move, slide between them without lifting, multi-touch safe.
- **Background music.** Original chiptune track synthesised live (no audio files). Calm in the menu, fuller in-game, an extra layer above 2 500 points. Ducks on pause and game over; stops when the tab is hidden. 🎵 toggle in the menu and HUD (saved).
- Sound toggles on the main menu.

### Changed

- **New spring jump animation.** Generated 8-frame superhero super-jump: charge → blast-off → cape-flutter flight with afterimages and sparkles → one somersault → unfold. Replaces the old continuous spin.
- **Springs "boing"**: they squash, overshoot and wobble with a shock ring. They're a little bigger and gently bob when idle.
- The ⚡ shoot button now sits between the move buttons.
- **Content Security Policy everywhere.** One policy (`tools/vite/csp.js`) is sent as a header on Vercel and embedded as a `<meta>` tag in every build, so the GitHub Pages mirror is protected too. A unit test keeps both in sync.
- **~70% smaller download** (≈ 2.5 MB → 0.75 MB): mascot poses are WebP, unused poses (`jump`, `fall`, `crouch` — replaced by the animation sheets) are no longer shipped, and source maps are no longer published.
- Vercel: `sw.js` and the manifest are never cached; `Cross-Origin-Opener-Policy` header added.

### Removed

- `public/assets/sprites/*.png` pose images (now `*.webp`; only `idle`, `shoot`, `hurt`, `cheer` are shipped).
- Public source maps.

## [1.2.1] - 2026-09-23

### Fixed

- New players no longer get a `403` from `rename_player` before their first score: the name is sent with the first run instead.
- Builds on Vercel/CI now print a clear warning when `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` are missing (previously the site silently fell back to the offline board).

## [1.2.0] - 2026-09-23

### Changed

- **No login at all.** The leaderboard no longer uses Supabase anonymous sign-ins. Each browser gets a random player id + secret (localStorage); the database stores only `sha256(secret)` and checks it on every write.
- New SQL functions `submit_score`, `rename_player`, `get_player_rank` (migration `20260923140000_no_login_players.sql`).
- The Supabase client is used as a database + realtime connection only (no auth session).

### Added

- **Vercel deployment**: `vercel.json` with caching and security headers (CSP allows only Supabase).
- Abuse limit: at most 30 new players per IP per hour.
- SQL snippets: reset leaderboard, remove test players, drop legacy auth functions.

### Removed

- The v1.1 anonymous-auth retry workaround (no longer needed without auth).

## [1.1.1] - 2026-09-23

### Fixed

- Leaderboard failed to load for new players with `401 PGRST303 "JWT issued at future"`. The token from a fresh anonymous sign-in could be slightly ahead of the database clock. Such requests are now retried with a short backoff.
- The open leaderboard panel now keeps retrying after an error, even while realtime is connected (it used to stay "Offline").

## [1.1.0] - 2026-09-23

### Added

- **Live global leaderboard** powered by Supabase: anonymous sign-in, realtime updates, a LIVE/offline status badge, and your own rank shown even outside the top 10.
- Supabase migration (`supabase/migrations`) with RLS, `submit_run` / `get_leaderboard` / `get_my_rank` / `set_player_name` RPCs, and basic anti-cheat (plausibility check, rate limit).
- SQL test suite (`npm run test:db`), also run in CI against Postgres 17.
- Offline queue: the best unsent run is retried automatically.
- Setup guide: `docs/SUPABASE.md`.

### Changed

- The leaderboard shows **only the highest score per person** (online and offline). Old local data is merged to one entry per name automatically.
- The leaderboard service moved to `src/services/leaderboard/` (`LocalLeaderboard`, `SupabaseLeaderboard`).
- `supabase-js` is lazy-loaded in its own chunk.

## [1.0.0] - 2026-09-23

### Added

- Core Doodle Jump–style gameplay: gravity, screen wrap, one-way platforms and an upward-only camera.
- Dlicom mascot with 7 generated poses (idle, jump, fall, crouch, shoot, hurt, cheer) plus procedural squash/stretch, lean and spring somersault.
- Platform types: normal, moving, breaking, vanishing; springs.
- Glitch-bug enemies you can stomp or shoot.
- DLI coins stamped with the Dlicom logo, a DLI coin bar in the HUD and a persistent wallet.
- Custom player name bar, live scoreboard with personal best, end-of-run scoreboard.
- Local top-10 leaderboard.
- Difficulty curve that scales with score, and procedural levels that are always beatable.
- Procedural Web Audio sound effects with a saved mute toggle.
- Keyboard and touch controls, responsive layout, PWA manifest.
- Tooling: Vite, ESLint, Prettier, Vitest, GitHub Actions CI and GitHub Pages deploy.

[Unreleased]: https://github.com/levsage/DiliJump/compare/v2.2.0...HEAD
[2.2.0]: https://github.com/levsage/DiliJump/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/levsage/DiliJump/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/levsage/DiliJump/compare/v1.2.1...v2.0.0
[1.2.1]: https://github.com/levsage/DiliJump/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/levsage/DiliJump/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/levsage/DiliJump/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/levsage/DiliJump/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/levsage/DiliJump/releases/tag/v1.0.0
