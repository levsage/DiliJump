# Branching & release workflow

```
feat/*, fix/* ──PR──► beta ──PR──► main ──tag──► vX.Y.Z
                        │             │
                   CI (lint/test/build)   CI + GitHub Pages deploy
```

| Branch               | Role                      | Rules                                                             |
| -------------------- | ------------------------- | ----------------------------------------------------------------- |
| `main`               | Production / stable       | Only merges from `beta` (or hotfixes). Every merge is releasable. |
| `beta`               | Pre-release / integration | Feature branches merge here first for testing.                    |
| `feat/*`, `fix/*`, … | Short-lived work branches | Branch from `beta`, PR back into `beta`.                          |

## Releasing

1. Make sure `beta` is green in CI and play-tested.
2. Bump the version in `package.json` and update `CHANGELOG.md`.
3. Open a PR `beta → main`, then merge it.
4. Tag it: `git tag -a vX.Y.Z -m "DiliJump vX.Y.Z" && git push --tags`.

## Hotfixes

Branch `fix/*` from `main`, PR into `main`, then merge `main` back into `beta`.

## Versioning

[SemVer](https://semver.org/): `MAJOR` for breaking save-data or gameplay
overhauls, `MINOR` for new features, `PATCH` for fixes.
