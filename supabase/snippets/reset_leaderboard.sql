-- Wipes ALL leaderboard data (players, runs, secrets). Cannot be undone.
-- Use once after upgrading to v1.2: rows from the old login-based version
-- can't be updated any more, so those players would appear twice.
truncate table public.runs, public.player_secrets, public.players restart identity;
