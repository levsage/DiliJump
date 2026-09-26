# Architecture

DiliJump is a dependency-free vanilla JavaScript game (ES modules) rendered on a
single `<canvas>`, with an HTML/CSS overlay for UI. Vite handles dev and build.

## Layers

```
┌──────────────────────────────── main.js (composition root) ────────────────────────────────┐
│                                                                                            │
│   UI (DOM)                   Core                     Rendering (Canvas)                   │
│   ─────────                  ────                     ──────────────────                   │
│   UIManager ◄── EventBus ──► Game (state machine) ──► Renderer ─► Background, brand        │
│   HUD, screens/                │                                                           │
│                                ▼                                                           │
│                              World (simulation)                                            │
│                               ├─ entities/  Player, Platform, Coin, Spring, Monster, …     │
│                               └─ systems/   LevelGenerator, Difficulty, Collision, Camera  │
│                                                                                            │
│   services/  Storage ─► Profile · Wallet · Settings   leaderboard/ Local | Supabase (live) │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Layer        | Rule                                                                               |
| ------------ | ---------------------------------------------------------------------------------- |
| `config/`    | Pure data. All tunables in `constants.js`.                                         |
| `core/`      | Game loop, state machine, simulation. No direct DOM access except `Input`.         |
| `entities/`  | Plain classes with `update(dt)`. No rendering code.                                |
| `systems/`   | Stateless or small-state helpers. `Collision` and `Difficulty` are pure functions. |
| `rendering/` | The only code that touches `CanvasRenderingContext2D`.                             |
| `services/`  | Persistence. Storage-agnostic, so a remote backend can be added later.             |
| `ui/`        | The only code that touches the DOM (apart from `main.js`).                         |

## Game states

```
loading ──► menu ──► playing ⇄ paused
              ▲         │
              │         ▼
              └──── gameover ──► playing (restart)
```

## Game loop

`GameLoop` runs a **fixed 120 Hz physics step** with a clamped accumulator. This
keeps jumps deterministic on any refresh rate and prevents tunnelling through
platforms on slow frames. Rendering runs once per animation frame.

The next frame is scheduled _before_ a frame runs, and each frame is wrapped in
`try/catch`: one bad frame is logged once and skipped. After
`MAX_FRAME_ERRORS` (30) failing frames in a row the loop stops and emits
`app:fatal`, and the UI shows a "Reload" screen. `AssetLoader` retries each image
twice before failing the boot.

## Coordinates

- **Solid side walls** (`WALL.WIDTH` = 16 px each): the playfield is
  `PLAYFIELD.LEFT … PLAYFIELD.RIGHT` (16 … 464). There is **no screen
  wrap-around** — `Player.collideWalls()` stops the mascot at the wall (gloves
  and cape may tuck `WALL.PLAYER_OVERLAP` px behind it), moving platforms and
  monsters bounce off the walls, and `LevelGenerator` places everything between
  them. A hard bump (≥ `WALL.BUMP_SPEED`) emits `player:wall-bump` (dust, wall
  glow, soft thud). The walls are drawn last, in front of the world.
- Logical resolution is **480 × 800**. The canvas is scaled to fit (up to DPR 2).
- World Y grows **downward**; climbing means decreasing Y. `camera.y` is the world Y of the top of the view.
- Player anchor = **bottom-centre** (feet), matching the sprite canvases.

## Player animation

Normal movement plays **generated animation sheets**; single generated poses
are short overrides. Sheets are atlases made by `tools/process_sheets.py`
(`public/assets/sprites/*-sheet.<hash>.webp` + `src/config/spriteSheets.json`).

Frames are chosen from the **physics state** (vertical speed + time since the
last bounce) in `src/entities/animation.js`, so the animation always matches
the real jump arc:

| Sheet        | Frames | Driven by                                                               |
| ------------ | ------ | ----------------------------------------------------------------------- |
| `jump` (3)   | 0      | Squat / push-off for 0.1 s after each bounce                            |
|              | 1      | Rising (moving up): fists up, cape flowing                              |
|              | 2      | Falling (moving down): cape billowing up                                |
| `spring` (8) | 0-1    | Charge, blast-off                                                       |
|              | 2-4    | Superhero flight, cape flutter loop (14 fps) + afterimages and sparkles |
|              | 5-6    | Somersault tuck with exactly one 360° flip                              |
|              | 7      | Unfold at the top, then hands over to the jump sheet's falling frame    |
| Single poses | —      | `shoot` (0.28 s), `cheer` (menu), `hurt` (dead)                         |

All frames are bottom-centre anchored (horizontal anchor = the body's mass
centre, so poses with an arm out don't jitter). Light procedural squash on
landing, stretch while rising and lean into movement are layered on top.

Springs have their own elastic animation (`springStretch()`): squash, overshoot
above rest height, damped wobble, plus a shock ring.

## Audio

`AudioManager` owns one Web Audio graph: `master (mute) → sfx | music`.
`MusicPlayer` (`src/systems/music/`) synthesises the original track in
`song.js` with a look-ahead scheduler. The game sets an intensity level:
0 menu (bass, arpeggio, hats), 1 playing (+ drums, lead), 2 above 2 500 points
(+ 16th hats, lead doubling). It ducks when paused or on game over, and the
audio context is suspended while the tab is hidden.

## Persistence

All keys are namespaced with `dilijump:v1:` in `localStorage`:

| Key                   | Contents                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `profile`             | `{ name, bestScore, gamesPlayed, totalScore }` — `totalScore` = lifetime XP → player level                     |
| `wallet`              | `{ balance, lifetime }` DLI coins                                                                              |
| `leaderboard`         | Offline board, one best entry per name `[{ id, name, score, coins, height, date, total }]`                     |
| `leaderboard:pending` | Runs that failed to reach Supabase (up to 30, oldest first; sent one per 3.3 s when back online)               |
| `identity`            | `{ playerId, secret, createdAt }`, the no-login leaderboard identity (the DB stores only a hash of the secret) |
| `settings`            | `{ muted, music }`                                                                                             |

If storage is unavailable (private mode), an in-memory backend is used.

## Leaderboard backends

`createLeaderboard()` (`src/services/leaderboard/index.js`) returns
`SupabaseLeaderboard` when `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` are set, otherwise `LocalLeaderboard`. Both
implement the same async interface:

| Method                                               | Returns                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| `init()`                                             | Creates the Supabase client (database only, no login)         |
| `submit({ name, score, coins, height, durationMs })` | `{ rank, isBest, bestScore, totalScore, level, online, … }`   |
| `top(limit)`                                         | `[{ rank, name, score, coins, date, level, isMe }]`, 1/person |
| `myEntry()`                                          | The current player's row, or `null`                           |
| `rename(old, new)`                                   | —                                                             |
| `subscribe(onChange, onStatus)`                      | Unsubscribe function (realtime)                               |

See [SUPABASE.md](SUPABASE.md) for the database side.

## Player level

Every point scored is XP; all runs add up (`profile.totalScore`, and
`players.total_score` in the database). The level comes from one formula in
two places that must agree — `src/systems/PlayerLevel.js` and
`public.player_level()` — and both are tested against the same fixture
(`tests/playerLevel.test.js`, `supabase/tests/levels_test.sql`):

```
XP to reach level L = 1000·(L−1) + 500·(L−1)(L−2)/2
```

| Level | 2     | 3     | 4     | 5     | 10     | 20      |
| ----- | ----- | ----- | ----- | ----- | ------ | ------- |
| XP    | 1 000 | 2 500 | 4 500 | 7 000 | 27 000 | 104 500 |

**The database is the source of truth** for the best score and XP. The game
updates its local copy instantly after each run, then mirrors the database —
up _or down_ — at start-up, after each accepted run and whenever the
leaderboard is shown (`ProfileService.syncWithServer`). Runs the database
hasn't received yet (offline queue + submissions in progress,
`leaderboard.unsyncedRuns()`) are added on top, so nothing is lost. So runs
from before v3.0 count, and a leaderboard reset also resets every player's
Best and level on their device. Shown as the menu XP bar, the HUD badge, the
game-over "+XP / LEVEL UP!" panel and the **Lv** pill on every leaderboard row.

## Production build

`npm run build` produces a hardened static site in `dist/` that works on any
host (relative `base: './'`: Vercel at `/`, GitHub Pages at `/DiliJump/`).

| Piece                   | Where                                        | What it does                                                                                                                                                                                                                                                             |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Content Security Policy | `tools/vite/csp.js`                          | One policy, sent as a header on Vercel (`vercel.json`) **and** injected as a `<meta>` tag into every build (for Pages). Only `self` and `*.supabase.co` (REST + realtime) are allowed. `tests/production.test.js` fails if `vercel.json` drifts.                         |
| Service worker          | `tools/vite/serviceWorker.js` → `dist/sw.js` | Generated at build time. Precaches the page, hashed bundles and `public/` (except `og-image`, `404`, `robots`). Navigations are network-first (3.5 s timeout → cached page); same-origin assets cache-first; **cross-origin requests (Supabase) are never intercepted**. |
| SW registration         | `src/services/serviceWorker.js`              | Production only. Checks for a new deploy when the tab becomes visible; when a new worker takes over, the menu shows "New version ready · Reload" (never mid-run).                                                                                                        |
| Caching headers         | `vercel.json`                                | `static/*` immutable for a year; `assets/*` a week; `sw.js` and the manifest `no-cache`.                                                                                                                                                                                 |
| Social card             | `public/og-image.jpg` (`npm run og-image`)   | 1200×630 card rendered from `tools/og/og-image.html` with the real game assets.                                                                                                                                                                                          |
| No source maps          | `vite.config.js`                             | `build.sourcemap: false`.                                                                                                                                                                                                                                                |

The cache name contains a hash of everything precached, so each deploy gets a
fresh cache and old ones are deleted when the new worker activates.

### Tests

- `npm test` — Vitest unit tests (`tests/*.test.js`).
- `npm run test:e2e` — Playwright smoke tests (`tests/e2e/*.spec.js`) against
  `vite preview` of the production build, on a mobile and a desktop profile:
  clean console, play/controls/pause, leaderboard, service worker + offline
  reload, CSP and 404. They run in CI **without** Supabase env on purpose (the
  offline board), so CI never writes to the live database.
