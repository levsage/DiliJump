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

Pose sprites (see `public/assets/sprites/sprites.json`) share one canvas size
and a bottom-centre anchor, so swapping poses never makes the character jump
around. Pose selection is a small state machine in `Player.updateAnimation()`:

| Condition           | Pose     |
| ------------------- | -------- |
| Just landed (0.1 s) | `crouch` |
| Shooting (0.28 s)   | `shoot`  |
| Rising              | `jump`   |
| Falling             | `fall`   |
| Near apex           | `idle`   |
| Dead                | `hurt`   |
| Menu / new record   | `cheer`  |

On top of the key poses there is procedural motion: squash on landing, stretch
while rising, lean into horizontal movement and a somersault on springs.

## Persistence

All keys are namespaced with `dilijump:v1:` in `localStorage`:

| Key                   | Contents                                                                            |
| --------------------- | ----------------------------------------------------------------------------------- |
| `profile`             | `{ name, bestScore, gamesPlayed }`                                                  |
| `wallet`              | `{ balance, lifetime }` DLI coins                                                   |
| `leaderboard`         | Offline board, one best entry per name `[{ id, name, score, coins, height, date }]` |
| `leaderboard:pending` | Best run that failed to reach Supabase (retried)                                    |
| `settings`            | `{ muted }`                                                                         |

If storage is unavailable (private mode), an in-memory backend is used.

## Leaderboard backends

`createLeaderboard()` (`src/services/leaderboard/index.js`) returns
`SupabaseLeaderboard` when `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` are set, otherwise `LocalLeaderboard`. Both
implement the same async interface:

| Method                                               | Returns                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `init()`                                             | Connects / signs in (Supabase)                               |
| `submit({ name, score, coins, height, durationMs })` | `{ rank, isBest, bestScore, online, queued? }`               |
| `top(limit)`                                         | `[{ rank, name, score, coins, date, isMe }]`, one per person |
| `myEntry()`                                          | The current player's row, or `null`                          |
| `rename(old, new)`                                   | —                                                            |
| `subscribe(onChange, onStatus)`                      | Unsubscribe function (realtime)                              |

See [SUPABASE.md](SUPABASE.md) for the database side.
