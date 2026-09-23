-- Remove QA / health-check rows from the leaderboard.
delete from public.players where name like 'QA-%' or name = 'HealthCheck';
