-- =============================================================================
-- Tests for player levels (v2.2): lifetime XP, level formula, back-fill.
-- Run with `npm run test:db` (applies shim + all migrations first).
-- The formula fixture below is shared with tests/playerLevel.test.js.
-- =============================================================================
\set QUIET on
begin;

create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.headers', '{"x-forwarded-for":"198.51.100.9"}', true);
  set local role anon;
end $$;
create or replace function pg_temp.age_runs() returns void language sql as
  $$ update public.runs set created_at = created_at - interval '1 minute' $$;

-- ---------------------------------------------------------------------------
-- 1. Formula (same fixture as the JS test)
-- ---------------------------------------------------------------------------
do $$
declare
  fx bigint[][] := array[
    [0, 1], [1, 1], [999, 1], [1000, 2], [2499, 2], [2500, 3], [4499, 3], [4500, 4],
    [7000, 5], [26999, 9], [27000, 10], [104499, 19], [104500, 20], [5000000, 140]
  ];
  i int;
begin
  for i in 1 .. array_length(fx, 1) loop
    assert public.player_level(fx[i][1]) = fx[i][2],
      format('player_level(%s) = %s, expected %s', fx[i][1], public.player_level(fx[i][1]), fx[i][2]);
  end loop;
  for i in 1 .. 400 loop
    assert public.player_level(public.player_level_xp(i)) = i, 'exact threshold reaches level ' || i;
    assert public.player_level(public.player_level_xp(i + 1) - 1) = i, 'one XP short stays at level ' || i;
  end loop;
  assert public.player_level(null) = 1 and public.player_level(-5) = 1, 'no XP = level 1';
  raise notice 'PASS L1: level formula matches the shared fixture and every threshold up to 400';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Every run adds to the lifetime XP; submit returns the level
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
do $$ declare r record; begin
  select * into r from public.submit_score('00000000-0000-4000-8000-0000000000d1',
    'dave-secret-dddddddddddddddddddddddddddddddddddddddddd', 'Dave', 600, 3, 3000, 60000);
  assert r.total_score = 600 and r.level = 1 and r.prev_level = 1, 'first run: 600 XP, level 1';
end $$;
reset role; select pg_temp.age_runs(); select pg_temp.as_anon();
do $$ declare r record; begin
  -- a lower score still counts towards the level
  select * into r from public.submit_score('00000000-0000-4000-8000-0000000000d1',
    'dave-secret-dddddddddddddddddddddddddddddddddddddddddd', 'Dave', 500, 1, 3000, 60000);
  assert not r.is_best and r.best_score = 600, 'best stays 600';
  assert r.total_score = 1100, 'total must be 1100, got ' || r.total_score;
  assert r.level = 2 and r.prev_level = 1, 'level up 1 -> 2';
  raise notice 'PASS L2: every run adds XP (even non-best ones); submit returns level + prev_level';
end $$;
reset role; select pg_temp.age_runs(); select pg_temp.as_anon();

-- ---------------------------------------------------------------------------
-- 3. Leaderboard + own row show total and level to everyone
-- ---------------------------------------------------------------------------
do $$ declare r record; begin
  select * into r from public.get_leaderboard(100) where player_id = '00000000-0000-4000-8000-0000000000d1';
  assert r.level = 2 and r.total_score = 1100, 'leaderboard row must carry level 2';
  select * into r from public.get_player_rank('00000000-0000-4000-8000-0000000000d1');
  assert r.level = 2 and r.total_score = 1100, 'own row must carry level 2';
  raise notice 'PASS L3: get_leaderboard / get_player_rank return total_score + level';
end $$;

-- rejected runs never add XP
do $$ begin
  begin
    perform public.submit_score('00000000-0000-4000-8000-0000000000d1',
      'dave-secret-dddddddddddddddddddddddddddddddddddddddddd', 'Dave', 999999, 0, 0, 1000);
    raise exception 'implausible score accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.submit_score('00000000-0000-4000-8000-0000000000d1', 'wrong-secret-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'Dave', 100, 0, 0, 60000);
    raise exception 'wrong secret accepted';
  exception when others then
    if sqlerrm = 'wrong secret accepted' then raise; end if;
  end;
end $$;
reset role;
do $$ begin
  assert (select total_score from public.players where id = '00000000-0000-4000-8000-0000000000d1') = 1100,
    'rejected runs must not add XP';
  raise notice 'PASS L4: rejected runs (implausible / wrong secret) add no XP';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Back-fill: players from before v2.2 get their whole run history
-- ---------------------------------------------------------------------------
insert into public.players (id, name, best_score, best_at, games_played, total_score)
values ('00000000-0000-4000-8000-0000000000e1', 'Eve', 800, now(), 3, 0),
       ('00000000-0000-4000-8000-0000000000e2', 'Old', 400, now(), 1, 0);
insert into public.runs (player_id, score, coins, height, duration_ms)
values ('00000000-0000-4000-8000-0000000000e1', 800, 0, 0, 60000),
       ('00000000-0000-4000-8000-0000000000e1', 300, 0, 0, 60000),
       ('00000000-0000-4000-8000-0000000000e1', 2400, 0, 0, 60000);
update public.players set best_score = 2400 where id = '00000000-0000-4000-8000-0000000000e1';

\i supabase/migrations/20260925120000_player_levels.sql
\i supabase/migrations/20260925120000_player_levels.sql

do $$ begin
  assert (select total_score from public.players where id = '00000000-0000-4000-8000-0000000000e1') = 3500,
    'Eve must get 800 + 300 + 2400 = 3500 XP';
  assert (select public.player_level(total_score) from public.players where id = '00000000-0000-4000-8000-0000000000e1') = 3,
    'Eve is level 3';
  -- no run history -> at least their best score
  assert (select total_score from public.players where id = '00000000-0000-4000-8000-0000000000e2') = 400,
    'player without runs keeps best as XP';
  -- re-running the migration never double counts
  assert (select total_score from public.players where id = '00000000-0000-4000-8000-0000000000d1') = 1100,
    'existing totals unchanged by a re-run';
  raise notice 'PASS L5: back-fill from run history, idempotent re-run';
end $$;

rollback;
\echo 'ALL LEVEL TESTS PASSED'
