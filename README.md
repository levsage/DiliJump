<div align="center">

<img src="public/assets/brand/icon-192.png" width="96" alt="Dlicom logo" />

# DiliJump

**A Doodle Jump–style 2D web game starring the Dlicom mascot.**
Jump from platform to platform, grab **DLI coins**, dodge glitch bugs and climb the leaderboard.

[![CI](https://github.com/levsage/DiliJump/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/levsage/DiliJump/actions/workflows/ci.yml)
![version](https://img.shields.io/badge/version-1.2.1-1f5fc9)
![license](https://img.shields.io/badge/license-MIT-green)

<img src="docs/images/screenshot-menu.jpg" width="260" alt="Main menu" />
&nbsp;
<img src="docs/images/screenshot-gameplay.jpg" width="260" alt="Gameplay" />

</div>

---

## ✨ Features

| Feature                 | Description                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 🎮 **Single player**    | Endless vertical climb with procedurally generated, always-beatable levels                                                  |
| 🦸 **Animated mascot**  | 7 generated poses (idle, jump, fall, crouch, shoot, hurt, cheer) + procedural squash & stretch, lean and spring somersaults |
| 🏷️ **Custom name bar**  | Pick your player name; shown in the in-game HUD and on the leaderboard                                                      |
| 🔢 **Scoreboard**       | Live score + personal best in the HUD, and a detailed end-of-run scoreboard                                                 |
| 🏆 **Leaderboard**      | Top-10 local leaderboard with medals, dates and coins                                                                       |
| 🪙 **DLI coin bar**     | Collect coins stamped with the Dlicom logo; run total in the HUD and a persistent DLI wallet                                |
| 🧩 **Platforms**        | Normal, moving, breaking and vanishing platforms plus springs                                                               |
| 👾 **Enemies**          | Glitch bugs — stomp them or shoot them with energy bolts                                                                    |
| 📱 **Mobile ready**     | Touch controls, responsive letter-boxed layout, installable PWA manifest                                                    |
| 🔊 **Procedural audio** | Web Audio sound effects, no audio files; mute toggle is saved                                                               |

## 🕹️ Controls

| Action | Keyboard            | Touch                                |
| ------ | ------------------- | ------------------------------------ |
| Move   | `←` `→` or `A` `D`  | Hold left / right half of the screen |
| Shoot  | `Space`, `↑` or `W` | ⚡ button                            |
| Pause  | `P` or `Esc`        | ❚❚ button                            |

## 🚀 Getting started

Requires **Node.js ≥ 22** (see `.nvmrc`).

```bash
git clone https://github.com/levsage/DiliJump.git
cd DiliJump
npm install
npm run dev        # http://localhost:5173
```

### Deploy (Vercel)

Import the repo at <https://vercel.com/new>, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as environment variables, and deploy. Settings come from `vercel.json`.

### Live leaderboard (optional)

```bash
cp .env.example .env.local   # add your Supabase URL + publishable key
```

Full guide: **[docs/SUPABASE.md](docs/SUPABASE.md)**. Without these values the game uses an offline leaderboard.

### Scripts

| Command           | What it does                                              |
| ----------------- | --------------------------------------------------------- |
| `npm run dev`     | Start the Vite dev server with hot reload                 |
| `npm run build`   | Production build into `dist/`                             |
| `npm run preview` | Serve the production build locally                        |
| `npm test`        | Run unit tests (Vitest)                                   |
| `npm run lint`    | Lint with ESLint                                          |
| `npm run format`  | Format with Prettier                                      |
| `npm run check`   | Lint + format check + tests + build (same as CI)          |
| `npm run sprites` | Re-process pose renders in `art/poses/` into game sprites |

## 🗂️ Project structure

```
DiliJump/
├── .github/                 # CI workflows, issue & PR templates
├── art/                     # Source artwork (not shipped)
│   ├── source/              # Original mascot reference & helmet highlight layer
│   └── poses/               # Generated pose renders (chroma-key backgrounds)
├── docs/                    # Architecture, gameplay, branching, images
├── public/                  # Static files copied as-is into the build
│   ├── assets/brand/        # Dlicom logo, DLI coin, favicons, app icons
│   ├── assets/sprites/      # Transparent mascot pose sprites + sprites.json
│   └── manifest.webmanifest
├── supabase/                # Leaderboard SQL migrations + SQL tests
├── src/
│   ├── config/              # constants.js (all tuning), assets.js (manifest)
│   ├── core/                # Game (state machine), World (simulation), GameLoop, Input, EventBus, AssetLoader
│   ├── entities/            # Player, Platform, Coin, Spring, Monster, Projectile, Particle
│   ├── systems/             # LevelGenerator, Difficulty, Collision, Camera, AudioManager
│   ├── rendering/           # Renderer, Background, brand (logo paths), palette
│   ├── services/            # Storage, Profile, Wallet, Settings, PlayerIdentity, supabaseClient, leaderboard/
│   ├── ui/                  # UIManager, HUD, screens/
│   ├── styles/              # main.css
│   └── main.js              # Composition root
├── tests/                   # Vitest unit tests
├── tools/                   # Asset pipeline scripts (Python)
└── index.html
```

More detail in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/GAMEPLAY.md`](docs/GAMEPLAY.md) and [`docs/SUPABASE.md`](docs/SUPABASE.md).

## 🌿 Branches

| Branch | Purpose                                                                       |
| ------ | ----------------------------------------------------------------------------- |
| `main` | Stable, released code. Deployed to GitHub Pages.                              |
| `beta` | Integration / pre-release testing (Vercel preview). Features land here first. |

See [`docs/BRANCHING.md`](docs/BRANCHING.md) for the full workflow.

## 🎨 Assets

- **Mascot** — based on the official Dlicom mascot artwork. Poses were AI-generated from the reference and processed with [`tools/process_sprites.py`](tools/process_sprites.py) (chroma-key, despill, uniform scale, bottom-centre anchor).
- **Logo** — the official Dlicom logo (`public/assets/brand/dlicom-logo.svg`). It is also drawn as vector paths on every DLI coin (`src/rendering/brand.js`).

<p align="center"><img src="docs/images/poses.png" alt="Mascot poses" /></p>

## 📄 License

Code is released under the [MIT License](LICENSE). The Dlicom name, logo and mascot artwork are trademarks of their respective owners and are **not** covered by the MIT license.
