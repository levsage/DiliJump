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

## Coordinates

- Logical resolution is **480 × 800**. The canvas is scaled to fit (up to DPR 2).
- World Y grows **downward**; climbing means decreasing Y. `camera.y` is the world Y of the top of the view.
- Player anchor = **bottom-centre** (feet), matching the sprite canvases.

## Player animation

Normal movement plays **generated animation sheets**; single generated poses
are short overrides. Sheets are atlases made by `tools/process_sheets.py`
(`public/assets/sprites/*-sheet.webp` + `src/config/spriteSheets.json`).

Frames are chosen from the **physics state** (vertical speed + time since the
last bounce) in `src/entities/animation.js`, so the animation always matches
the real jump arc:

| Sheet        | Frames | Driven by                                                               |
| ------------ | ------ | ----------------------------------------------------------------------- |
| `jump` (12)  | 0-3    | Time since bounce: landing squat → push-off (35 ms each)                |
|              | 4-7    | Upward speed: rising → apex hang                                        |
|              | 8-11   | Downward speed: start of fall → legs out, ready to land                 |
| `spring` (8) | 0-1    | Charge, blast-off                                                       |
|              | 2-4    | Superhero flight, cape flutter loop (14 fps) + afterimages and sparkles |
|              | 5-6    | Somersault tuck with exactly one 360° flip                              |
|              | 7      | Unfold at the top, then hands over to the jump sheet's falling frames   |
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
| `profile`             | `{ name, bestScore, gamesPlayed }`                                                                             |
| `wallet`              | `{ balance, lifetime }` DLI coins                                                                              |
| `leaderboard`         | Offline board, one best entry per name `[{ id, name, score, coins, height, date }]`                            |
| `leaderboard:pending` | Best run that failed to reach Supabase (retried)                                                               |
| `identity`            | `{ playerId, secret, createdAt }`, the no-login leaderboard identity (the DB stores only a hash of the secret) |
| `settings`            | `{ muted, music }`                                                                                             |

If storage is unavailable (private mode), an in-memory backend is used.

## Leaderboard backends

`createLeaderboard()` (`src/services/leaderboard/index.js`) returns
`SupabaseLeaderboard` when `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` are set, otherwise `LocalLeaderboard`. Both
implement the same async interface:

| Method                                               | Returns                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `init()`                                             | Creates the Supabase client (database only, no login)        |
| `submit({ name, score, coins, height, durationMs })` | `{ rank, isBest, bestScore, online, queued? }`               |
| `top(limit)`                                         | `[{ rank, name, score, coins, date, isMe }]`, one per person |
| `myEntry()`                                          | The current player's row, or `null`                          |
| `rename(old, new)`                                   | —                                                            |
| `subscribe(onChange, onStatus)`                      | Unsubscribe function (realtime)                              |

See [SUPABASE.md](SUPABASE.md) for the database side.
