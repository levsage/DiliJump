# Branching & release workflow

```
feat/*, fix/* ──PR──► beta ──PR──► main ──tag──► vX.Y.Z
                        │             │
              CI + Vercel preview   CI + Vercel production + GitHub Pages
```

| Branch               | Role                      | Rules                                                             |
| -------------------- | ------------------------- | ----------------------------------------------------------------- |
| `main`               | Production / stable       | Only merges from `beta` (or hotfixes). Every merge is releasable. |
| `beta`               | Pre-release / integration | Feature branches merge here first for testing.                    |
| `feat/*`, `fix/*`, … | Short-lived work branches | Branch from `beta`, PR back into `beta`.                          |

## Releasing

1. Make sure `beta` is green in CI (lint, unit, **E2E**, SQL) and play-tested on the Vercel preview.
2. Bump the version in `package.json` and update `CHANGELOG.md`.
3. Open a PR `beta → main`, then merge it. Vercel deploys production; the Pages workflow deploys the mirror.
4. Tag it: `git tag -a vX.Y.Z -m "DiliJump vX.Y.Z" && git push --tags`, and publish a GitHub Release with the changelog entry.
5. Fast-forward `beta` to `main`.

### Pre-launch checklist

- [ ] `npm run check` and `npm run test:e2e` pass locally.
- [ ] Vercel env vars `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` are set for Production (the build warns if they're missing).
- [ ] New SQL migrations applied to the live project (`supabase/migrations/`), and `npm run check:supabase` is green.
- [ ] After deploy: the live site shows the new version in the menu footer, the leaderboard says **LIVE**, and the browser console is clean.
- [ ] Returning players see "New version ready" (service worker update) — no manual cache clearing needed.

## Hotfixes

Branch `fix/*` from `main`, PR into `main`, then merge `main` back into `beta`.

## Versioning

[SemVer](https://semver.org/): `MAJOR` for breaking save-data or gameplay
overhauls, `MINOR` for new features, `PATCH` for fixes.
