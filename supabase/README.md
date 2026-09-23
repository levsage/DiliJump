# Supabase

Database code for the live leaderboard. Setup guide: [`docs/SUPABASE.md`](../docs/SUPABASE.md).

| Path                         | Purpose                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `migrations/`                | SQL to run in the Supabase SQL editor, or with `supabase db push`                                                    |
| `tests/supabase_shim.sql`    | Minimal stand-in for `auth.uid()`, roles and the realtime publication, so migrations can be tested on plain Postgres |
| `tests/leaderboard_test.sql` | Assertions for the leaderboard rules and security                                                                    |
| `tests/run-local.sh`         | `npm run test:db`                                                                                                    |

Naming: `YYYYMMDDHHMMSS_description.sql` (compatible with the Supabase CLI).
