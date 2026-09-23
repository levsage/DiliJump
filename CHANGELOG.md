# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/levsage/DiliJump/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/levsage/DiliJump/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/levsage/DiliJump/releases/tag/v1.0.0
