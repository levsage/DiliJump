-- =============================================================================
-- Tests for 20260923120000_live_leaderboard.sql
-- Run:  psql -v ON_ERROR_STOP=1 -f supabase/tests/leaderboard_test.sql
-- (after the shim + migration have been applied). Any failure raises.
-- =============================================================================
\set QUIET on
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c');

-- helper: act as a given auth user (like a request with that JWT)
create or replace function pg_temp.act_as(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), true);
  execute 'set local role ' || case when p is null then 'anon' else 'authenticated' end;
end $$;
-- helper: bypass the 3s rate limit between test submissions
create or replace function pg_temp.age_runs() returns void language sql as
  $$ update public.runs set created_at = created_at - interval '1 minute' $$;

-- ---------------------------------------------------------------------------
-- 1. Only the highest score per person is kept
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select * from public.submit_run('Alice', 500, 5, 3000, 60000);
reset role; select pg_temp.age_runs(); select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select * from public.submit_run('Alice', 300, 9, 2000, 60000);   -- worse run
reset role; select pg_temp.age_runs(); select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');

do $$ declare r record; begin
  select * into r from public.players where id = '00000000-0000-0000-0000-00000000000a';
  assert r.best_score = 500, 'best score must stay 500, got ' || r.best_score;
  assert r.best_coins = 5,   'best_coins must belong to the best run';
  assert r.games_played = 2, 'games_played should be 2';
  assert r.total_coins = 14, 'total_coins should accumulate (5+9)';
  raise notice 'PASS 1: lower score does not replace personal best';
end $$;

-- a better run replaces it and reports is_best
do $$ declare r record; begin
  select * into r from public.submit_run('Alice', 900, 11, 5000, 60000);
  assert r.best_score = 900 and r.is_best, 'better run must become best';
  assert r.rank = 1, 'Alice should be rank 1';
  raise notice 'PASS 2: higher score replaces personal best (is_best, rank)';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Leaderboard = one row per person, correct order
-- ---------------------------------------------------------------------------
reset role; select pg_temp.age_runs();
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select * from public.submit_run('Bob', 700, 2, 4000, 60000);
reset role; select pg_temp.age_runs(); select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select * from public.submit_run('Bob', 650, 2, 4000, 60000);
reset role; select pg_temp.age_runs();
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select * from public.submit_run('Cara', 700, 1, 4000, 60000);    -- ties Bob, but later
reset role;

select pg_temp.act_as(null);  -- anonymous visitor can read the board
do $$ declare names text; n int; begin
  select string_agg(name || ':' || best_score, ',' order by rank), count(*)
    into names, n from public.get_leaderboard(10);
  assert n = 3, 'expected 3 rows (one per person), got ' || n;
  assert names = 'Alice:900,Bob:700,Cara:700', 'wrong order: ' || names;
  raise notice 'PASS 3: leaderboard has one row per person, ties -> earliest first (%)', names;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. get_my_rank
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
do $$ declare r record; begin
  select * into r from public.get_my_rank();
  assert r.rank = 3 and r.name = 'Cara', 'Cara should be rank 3';
  raise notice 'PASS 4: get_my_rank returns own rank';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Security
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
do $$ begin
  begin
    update public.players set best_score = 999999 where id = '00000000-0000-0000-0000-00000000000b';
    raise exception 'direct UPDATE should be denied';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.players (id, name, best_score) values ('00000000-0000-0000-0000-00000000000b', 'x', 1);
    raise exception 'direct INSERT should be denied';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.players;
    raise exception 'direct DELETE should be denied';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS 5: direct writes are blocked';
end $$;

-- rate limit (Bob just played... age runs off? no — Cara/Bob last run is recent)
do $$ begin
  begin
    perform public.submit_run('Bob', 10, 0, 10, 60000);
    perform public.submit_run('Bob', 10, 0, 10, 60000);
    raise exception 'rate limit not enforced';
  exception when raise_exception then
    if sqlerrm not like 'Too many%' then raise; end if;
  end;
  raise notice 'PASS 6: rate limit enforced';
end $$;
reset role; select pg_temp.age_runs();

select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
do $$ begin
  begin
    perform public.submit_run('Bob', 1000000, 0, 0, 5000);
    raise exception 'implausible score accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_run('B', 10, 0, 0, 5000);
    raise exception 'short name accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.submit_run('Bob', -5, 0, 0, 5000);
    raise exception 'negative score accepted';
  exception when invalid_parameter_value then null; end;
  raise notice 'PASS 7: invalid / implausible runs rejected';
end $$;
reset role;

select pg_temp.act_as(null);
do $$ begin
  begin
    perform public.submit_run('Anon', 10, 0, 0, 5000);
    raise exception 'anon submit should be denied';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS 8: signed-out visitors cannot submit';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. Name sanitising + rename
-- ---------------------------------------------------------------------------
select pg_temp.age_runs();
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
do $$ declare n text; begin
  n := public.set_player_name('  <b>Cara</b>   Star  ');
  assert n = 'bCara/b Star', 'sanitised name was ' || n;
  raise notice 'PASS 9: names sanitised on the server (%)', n;
end $$;
reset role;

rollback;
\echo 'ALL LEADERBOARD TESTS PASSED'
