# Live leaderboard: Supabase database, no backend, no login

```
Browser (GitHub Pages / Vercel, static files only)
  │  player id + secret created once, kept in localStorage   ← no login, no account
  │
  ├── rpc('submit_score', { id, secret, name, score… })      → database keeps max(score) per player
  ├── rpc('get_leaderboard', 10)                              → top 10, one row per person
  ├── rpc('get_player_rank', id)                              → your own rank
  └── realtime: postgres_changes on players                   → the open board updates live
  ▼
Supabase Postgres
  players         1 row per player (public, read-only)
  runs            every submitted run (private)
  player_secrets  sha256(secret) per player (private)
```

There is **no server of your own**. The game is plain static files, and all
the rules live **inside the database** as SQL functions:

- **One best score per person.** `best_score = greatest(old, new)`
- **Nobody can post as someone else.** Every write must present the browser's secret. Only its hash is stored.
- **Basic anti-cheat.** Scores that are impossible for the run time are rejected, one run per 3 s per player, at most 30 new players per network (IP) per hour.
- **Direct table writes are blocked** by Row Level Security.

**What stays in the browser (localStorage):** player name, personal best,
games played, DLI coin wallet, settings, and the player id and secret.
Clearing site data or switching browsers makes you a new player.

---

## 1. Create the Supabase project

<https://supabase.com/dashboard> → **New project**. For Bangladesh, the
closest region is **Singapore**. Supabase Auth is **not** used, so there's no
need to set up sign-in providers.

## 2. Create the database objects

**SQL Editor → New query**, then run these files **in order** (each one is safe to run again):

1. [`supabase/migrations/20260923120000_live_leaderboard.sql`](../supabase/migrations/20260923120000_live_leaderboard.sql): tables, RLS, leaderboard, realtime
2. [`supabase/migrations/20260923140000_no_login_players.sql`](../supabase/migrations/20260923140000_no_login_players.sql): no-login identities and the `submit_score` / `rename_player` / `get_player_rank` functions
3. [`supabase/migrations/20260925120000_player_levels.sql`](../supabase/migrations/20260925120000_player_levels.sql): **player levels** (v3.0) — `players.total_score` (lifetime XP, back-filled from the run history), `player_level()`, and `level` / `total_score` on `submit_score`, `get_leaderboard` and `get_player_rank`

> **Upgrading to v3.0:** run file 3 only. It's backward compatible: older game
> versions keep working, and the v3.0 game works before it's applied (levels
> then come from each browser only and aren't shown on the global board).

> **Upgrading from v1.1** (anonymous sign-ins): run file 2. Then, once v1.2 is
> live, run [`supabase/snippets/reset_leaderboard.sql`](../supabase/snippets/reset_leaderboard.sql)
> to clear the old rows (they can't be linked to the new browser ids and would
> otherwise show up twice), and
> [`supabase/snippets/drop_legacy_auth.sql`](../supabase/snippets/drop_legacy_auth.sql).
> You can then turn **off** _Authentication → Sign In / Providers → Allow anonymous sign-ins_.

## 3. Copy the URL and publishable key

**Project Settings → API Keys** (and **Data API** for the URL):

| Value           | Looks like                                                              |
| --------------- | ----------------------------------------------------------------------- |
| Project URL     | `https://abcdefghijklm.supabase.co`                                     |
| Publishable key | `sb_publishable_…` (older projects: the legacy **anon** key also works) |

> ⚠️ Never use a `sb_secret_…` / `service_role` key in the game. It bypasses
> every rule above. The publishable key is designed to be public.

## 4. Deploy on Vercel

1. <https://vercel.com/new> → **Import** `levsage/DiliJump`.
2. **Framework preset: Vite** (detected from `vercel.json`; no build settings to change).
3. **Environment Variables** → add both, for Production and Preview:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. Click **Deploy**.

Vite embeds these values at **build time**. If you change them later, go to
**Deployments → ⋯ → Redeploy**.

Branches: `main` becomes Production. `beta` and PRs get Preview URLs automatically.

## 5. Local development

```bash
cp .env.example .env.local   # fill in the two values
npm run dev
```

## Verify

- **In the game:** play a run, then open 🏆 Leaderboard. The badge should say **LIVE**.
- **Automated:** Actions → **Supabase health check** → Run workflow (uses the GitHub secrets), or `npm run check:supabase` locally.

## Resetting the leaderboard

Run [`supabase/snippets/reset_leaderboard.sql`](../supabase/snippets/reset_leaderboard.sql).
Each player's **Best** and **level** on their own device follow the board
automatically (v3.0.1+): they go back to 0 the next time the game or the
leaderboard is opened. Coins (DLI wallet) and games played are kept.

## Moderation

**Table Editor → players**: delete a row to remove a player (their runs and
secret are deleted with it). Useful snippets are in `supabase/snippets/`.

## Limits of a no-login design

- A player is tied to one browser. Clearing site data creates a new player; the old entry stays on the board.
- Anyone who reads the game code can send their own requests. The database checks (plausibility, rate limits) make cheating harder but can't stop it completely. That would need server-side game verification.

## Testing the SQL locally

```bash
npm run test:db   # needs PostgreSQL + psql (PGHOST/PGUSER/PGPASSWORD)
```

This runs every migration twice against a throwaway database with a tiny
Supabase shim, then the assertions in every `supabase/tests/*_test.sql`
([`leaderboard_test.sql`](../supabase/tests/leaderboard_test.sql),
[`levels_test.sql`](../supabase/tests/levels_test.sql)).
CI runs it on every push.

## Troubleshooting

| Symptom                                  | Fix                                                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Badge says **Offline · this device**     | Env vars missing at build time. Add them in Vercel, then redeploy.                                        |
| `function submit_score does not exist`   | Run migration 2                                                                                           |
| No **Lv** badges on the global board     | Run migration 3 (player levels)                                                                           |
| Board loads but never shows **LIVE**     | **Database → Publications → supabase_realtime**: include `players`. The board still refreshes every 15 s. |
| `Invalid player credentials`             | The browser's secret doesn't match (e.g. edited localStorage). Clear site data to become a new player.    |
| `Too many new players from this network` | 30 new ids per IP per hour. Wait, or raise the limit in `authorize_player`.                               |
| `Implausible score`                      | Anti-cheat rejected the run                                                                               |
