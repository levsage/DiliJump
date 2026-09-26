-- Wipes ALL leaderboard data (players, runs, secrets). Cannot be undone.
-- Use once after upgrading to v1.2: rows from the old login-based version
-- can't be updated any more, so those players would appear twice.
--
-- Players' screens follow automatically (v3.0.1+): the next time the game
-- opens (or the leaderboard is shown) each device's Best score and level are
-- set back to what the database has — 0 after a reset.
truncate table public.runs, public.player_secrets, public.players restart identity;
