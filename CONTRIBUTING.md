# Contributing to DiliJump

## Workflow

1. Branch off **`beta`**: `git checkout beta && git pull && git checkout -b feat/short-description`
2. Make your changes and keep commits small and focused.
3. Run `npm run check` (lint + format + tests + build). It must pass.
4. Open a Pull Request into **`beta`**.
5. When `beta` is stable, it gets merged into **`main`** and tagged (`vX.Y.Z`).

See [docs/BRANCHING.md](docs/BRANCHING.md) for details.

## Branch names

| Prefix      | Use for                               |
| ----------- | ------------------------------------- |
| `feat/`     | New features                          |
| `fix/`      | Bug fixes                             |
| `refactor/` | Code changes with no behaviour change |
| `docs/`     | Documentation                         |
| `chore/`    | Tooling, deps, CI                     |
| `art/`      | Sprites and brand assets              |

## Commit messages — [Conventional Commits](https://www.conventionalcommits.org/)

```
feat(player): add double-jump power-up
fix(ui): leaderboard overflow on small screens
docs: explain difficulty curve
```

## Code style

- ES modules, no globals. Dependencies are passed through constructors and wired only in `src/main.js`.
- Gameplay numbers go in `src/config/constants.js`, never hard-coded.
- Keep `World`/entities free of DOM code; talk to the UI through the `EventBus`.
- Add or update unit tests in `tests/` for pure logic (generation, collision, services).
- Prettier and ESLint are the source of truth for formatting.

## Assets

- New poses: put the magenta-background render in `art/poses/<pose>.png`, add the pose to `POSES` in `tools/process_sprites.py` and `PLAYER_POSES` in `src/config/assets.js`, then run `npm run sprites`.
