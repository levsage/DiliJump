# Live leaderboard with Supabase

DiliJump's global leaderboard runs on [Supabase](https://supabase.com).
**Each player gets one row: their highest score.** Worse runs never replace it.

If Supabase isn't configured, the game falls back to an offline leaderboard
stored in the browser (localStorage), with the same one-row-per-person rule.

```
Browser (publishable key)
  │  1. signInAnonymously()            → a player id per device, no email needed
  │  2. rpc('submit_run', …)           → server keeps max(score) per player
  │  3. rpc('get_leaderboard', 10)     → top 10, one row per person
  │  4. realtime: postgres_changes     → the open board refreshes live
  ▼
Postgres: public.players (1 row / player)   public.runs (history)
          RLS: everyone can read players, nobody can write directly
```

---

## Step 1: Create a project

1. Go to <https://supabase.com/dashboard> and click **New project**.
2. Pick a name (e.g. `dilijump`), a database password and a region close to your players. For Bangladesh, **Singapore (ap-southeast-1)** is the closest.
3. Wait about a minute for the project to finish setting up.

## Step 2: Turn on anonymous sign-ins

**Authentication → Sign In / Providers**, then switch on **"Allow anonymous sign-ins"** and save.

> Each browser then gets its own player id without an email or password.
> Recommended: under **Authentication → Attack Protection**, turn on
> **CAPTCHA** (Cloudflare Turnstile) later to stop scripted fake accounts.

## Step 3: Create the tables and functions

1. Open **SQL Editor → New query**.
2. Paste the whole file
   [`supabase/migrations/20260923120000_live_leaderboard.sql`](../supabase/migrations/20260923120000_live_leaderboard.sql).
3. Click **Run**. It should say _Success. No rows returned_.

It is safe to run again. It creates:

| Object               | Purpose                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| `players` table      | **One row per player** with their best score, coins and height. This is the leaderboard.                |
| `runs` table         | Every submitted run (history, stats, rate limiting)                                                     |
| `submit_run()`       | Validates a run and keeps **`greatest(old_best, new_score)`**. Returns `best_score`, `is_best`, `rank`. |
| `get_leaderboard(n)` | Top _n_ players, one row per person                                                                     |
| `get_my_rank()`      | The current player's own row and rank, even outside the top 10                                          |
| `set_player_name()`  | Renames the player when they edit the name bar                                                          |
| RLS policies         | Anyone can **read** `players`; **nobody can insert, update or delete directly**                         |
| Realtime             | Adds `players` to the `supabase_realtime` publication                                                   |

To check: open **Table Editor**. You should see `players` and `runs`, both marked **RLS enabled**.

## Step 4: Get the URL and publishable key

**Project Settings → API Keys** (and **Data API** for the URL):

| Value           | Looks like                                                              |
| --------------- | ----------------------------------------------------------------------- |
| Project URL     | `https://abcdefghijklm.supabase.co`                                     |
| Publishable key | `sb_publishable_…` (older projects: the **anon** key `eyJ…` also works) |

> ⚠️ **Never** use the `sb_secret_…` or `service_role` key in the game. It
> bypasses all security. The publishable key is meant to be public. The RLS
> policies and the `submit_run` checks are what protect the data.

## Step 5: Local development

```bash
cp .env.example .env.local
# edit .env.local:
# VITE_SUPABASE_URL=https://abcdefghijklm.supabase.co
# VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
npm run dev
```

`.env.local` is git-ignored. Restart `npm run dev` after changing it.

To test: enter a name, play one run, then open **🏆 Leaderboard**. The badge
should say **LIVE**. Open the game in a second browser (or an incognito
window), play with another name, and the first window updates by itself.

## Step 6: Production (GitHub Pages)

The deploy workflow reads the values from repository **secrets**:

1. GitHub → **Settings → Secrets and variables → Actions → New repository secret**
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
2. **Settings → Pages → Source = GitHub Actions** (one-time).
3. Push to `main`, or re-run **Deploy to GitHub Pages** from the Actions tab.

---

## How "highest score per person" is enforced

It happens **on the server**, so a modified client can't lower or duplicate entries:

```sql
insert into players (...) values (...)
on conflict (id) do update set
  best_score = greatest(players.best_score, excluded.best_score),
  -- best_coins / best_height / best_at only change when the score improves
```

- The player id is the Supabase Auth user id (`auth.uid()`). It is taken from the verified token, never from the request body.
- Ties go to **whoever reached the score first** (`best_at`).
- Renaming updates the same row, so a player can't appear twice by changing their name.

## Anti-cheat (basic)

A browser game can never be fully cheat-proof, but `submit_run` rejects:

- scores that are impossible for the run time (`score > duration_s × 400 + 2000`)
- more than 1 submission every 3 seconds per player
- negative values, or names shorter than 2 characters
- anything from signed-out visitors

For stronger protection, add CAPTCHA to anonymous sign-ins. For moderation,
you can delete a cheater's row in **Table Editor → players**.

## Offline behaviour

If a submission fails because of the network, the best unsent run is kept in
`localStorage` and retried automatically. If Realtime is blocked, the open
leaderboard polls every 15 s instead.

## Testing the SQL locally

```bash
# needs a local PostgreSQL + psql (PGHOST/PGUSER/PGPASSWORD env vars)
npm run test:db
```

This runs the migration twice (it must be re-runnable) against a throwaway
database with a tiny Supabase shim, then runs
[`supabase/tests/leaderboard_test.sql`](../supabase/tests/leaderboard_test.sql):
one-row-per-person, ordering, ranks, blocked direct writes, rate limit,
validation and name sanitising. CI runs this on every push.

## Troubleshooting

| Symptom                                          | Fix                                                                                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Badge says **Offline · this device**             | Env vars not set. Check `.env.local` / Actions secrets, then restart or rebuild.                                             |
| `Anonymous sign-ins are disabled` in the console | Step 2                                                                                                                       |
| `function submit_run does not exist`             | Step 3 wasn't run in this project                                                                                            |
| Board loads but never shows **LIVE**             | **Database → Publications → supabase_realtime**: make sure `players` is included. The board still auto-refreshes every 15 s. |
| `Implausible score`                              | The server rejected the run (anti-cheat). Expected for tampered scores.                                                      |
