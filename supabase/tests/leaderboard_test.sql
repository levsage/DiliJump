-- =============================================================================
-- Tests for the DiliJump leaderboard (v1.2 — no login).
-- Run with `npm run test:db` (applies shim + all migrations first).
-- =============================================================================
\set QUIET on
begin;

-- Act as the public game client (publishable key => role anon)
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.headers', '{"x-forwarded-for":"203.0.113.7, 10.0.0.1"}', true);
  set local role anon;
end $$;
-- bypass the 3 s rate limit between test submissions
create or replace function pg_temp.age_runs() returns void language sql as
  $$ update public.runs set created_at = created_at - interval '1 minute' $$;

\set alice '''00000000-0000-4000-8000-00000000000a'''
\set bob   '''00000000-0000-4000-8000-00000000000b'''
\set cara  '''00000000-0000-4000-8000-00000000000c'''
\set sa    '''alice-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'''
\set sb    '''bob-secret-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'''
\set sc    '''cara-secret-cccccccccccccccccccccccccccccccccccccccccc'''

-- ---------------------------------------------------------------------------
-- 1. First submit registers the browser; only the highest score is kept
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
select * from public.submit_score(:alice, :sa, 'Alice', 500, 5, 3000, 60000);
reset role; select pg_temp.age_runs(); select pg_temp.as_anon();
select * from public.submit_score(:alice, :sa, 'Alice', 300, 9, 2000, 60000);
reset role; select pg_temp.age_runs();

do $$ declare r record; begin
  select * into r from public.players where id = '00000000-0000-4000-8000-00000000000a';
  assert r.best_score = 500, 'best must stay 500, got ' || r.best_score;
  assert r.best_coins = 5, 'best_coins belongs to the best run';
  assert r.games_played = 2 and r.total_coins = 14, 'games/coins totals wrong';
  assert (select secret_hash from public.player_secrets where player_id = r.id) = public.hash_secret('alice-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    'secret must be stored hashed';
  assert (select ip_hash from public.player_secrets where player_id = r.id) = encode(sha256('203.0.113.7'::bytea), 'hex'),
    'first x-forwarded-for IP should be hashed';
  raise notice 'PASS 1: no-login registration; lower score does not replace best; secret + IP hashed';
end $$;

select pg_temp.as_anon();
do $$ declare r record; begin
  select * into r from public.submit_score('00000000-0000-4000-8000-00000000000a', 'alice-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Alice', 900, 11, 5000, 60000);
  assert r.best_score = 900 and r.is_best and r.rank = 1, 'better run must become best at rank 1';
  raise notice 'PASS 2: higher score replaces best (is_best, rank 1)';
end $$;
reset role; select pg_temp.age_runs();

-- ---------------------------------------------------------------------------
-- 2. One row per person, ordering, ties
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
select * from public.submit_score(:bob, :sb, 'Bob', 700, 2, 4000, 60000);
reset role; select pg_temp.age_runs(); select pg_temp.as_anon();
select * from public.submit_score(:bob, :sb, 'Bob', 650, 2, 4000, 60000);
reset role; select pg_temp.age_runs(); select pg_temp.as_anon();
select * from public.submit_score(:cara, :sc, 'Cara', 700, 1, 4000, 60000);
do $$ declare names text; n int; begin
  select string_agg(name || ':' || best_score, ',' order by rank), count(*) into names, n
  from public.get_leaderboard(10);
  assert n = 3, 'expected 3 rows, got ' || n;
  assert names = 'Alice:900,Bob:700,Cara:700', 'wrong order: ' || names;
  raise notice 'PASS 3: one row per person, ties -> earliest first (%)', names;
end $$;

do $$ declare r record; begin
  select * into r from public.get_player_rank('00000000-0000-4000-8000-00000000000c');
  assert r.rank = 3 and r.name = 'Cara', 'Cara should be rank 3';
  raise notice 'PASS 4: get_player_rank';
end $$;
reset role; select pg_temp.age_runs();

-- ---------------------------------------------------------------------------
-- 3. Security
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
do $$ begin
  begin
    perform public.submit_score('00000000-0000-4000-8000-00000000000a', 'wrong-secret-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'Mallory', 99999, 0, 0, 600000);
    raise exception 'wrong secret accepted';
  exception when invalid_authorization_specification then null; end;
  begin
    perform public.rename_player('00000000-0000-4000-8000-00000000000b', 'wrong-secret-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'Hacked');
    raise exception 'rename with wrong secret accepted';
  exception when invalid_authorization_specification then null; end;
  raise notice 'PASS 5: cannot submit or rename as someone else';
end $$;

do $$ begin
  begin perform * from public.player_secrets; raise exception 'secrets readable';
  exception when insufficient_privilege then null; end;
  begin update public.players set best_score = 1e6; raise exception 'direct UPDATE allowed';
  exception when insufficient_privilege then null; end;
  begin insert into public.players (id, name) values (gen_random_uuid(), 'x'); raise exception 'direct INSERT allowed';
  exception when insufficient_privilege then null; end;
  begin delete from public.players; raise exception 'direct DELETE allowed';
  exception when insufficient_privilege then null; end;
  begin perform public.authorize_player(gen_random_uuid(), repeat('s', 40), 'x', true); raise exception 'internal fn callable';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS 6: secrets hidden; direct writes and internal functions blocked';
end $$;

do $$ begin
  begin
    perform public.submit_score('00000000-0000-4000-8000-00000000000c', 'cara-secret-cccccccccccccccccccccccccccccccccccccccccc', 'Cara', 10, 0, 0, 60000);
    perform public.submit_score('00000000-0000-4000-8000-00000000000c', 'cara-secret-cccccccccccccccccccccccccccccccccccccccccc', 'Cara', 10, 0, 0, 60000);
    raise exception 'rate limit not enforced';
  exception when raise_exception then
    if sqlerrm not like 'Too many%' then raise; end if;
  end;
  raise notice 'PASS 7: 3 s rate limit';
end $$;
reset role; select pg_temp.age_runs(); select pg_temp.as_anon();

do $$ begin
  begin perform public.submit_score(gen_random_uuid(), repeat('s', 40), 'Eve', 1000000, 0, 0, 5000); raise exception 'implausible accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.submit_score(gen_random_uuid(), repeat('s', 40), 'E', 10, 0, 0, 5000); raise exception 'short name accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.submit_score(gen_random_uuid(), 'short', 'Eve', 10, 0, 0, 5000); raise exception 'short secret accepted';
  exception when invalid_authorization_specification then null; end;
  raise notice 'PASS 8: invalid / implausible runs rejected';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Rename + sanitising
-- ---------------------------------------------------------------------------
do $$ declare n text; begin
  n := public.rename_player('00000000-0000-4000-8000-00000000000c', 'cara-secret-cccccccccccccccccccccccccccccccccccccccccc', '  <b>Cara</b>   Star ');
  assert n = 'bCara/b Star', 'sanitised name was ' || n;
  assert (select count(*) from public.players where id = '00000000-0000-4000-8000-00000000000c') = 1, 'rename must not duplicate';
  raise notice 'PASS 9: rename keeps one row; names sanitised (%)', n;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. Abuse limit: 30 new players per IP per hour
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
do $$ declare i int; begin
  -- 3 already created from this IP (Alice, Bob, Cara)
  for i in 1..27 loop
    perform public.submit_score(gen_random_uuid(), repeat('k', 40) || i, 'Bot' || i, 1, 0, 0, 5000);
  end loop;
  begin
    perform public.submit_score(gen_random_uuid(), repeat('k', 40) || 'x', 'Bot31', 1, 0, 0, 5000);
    raise exception 'IP limit not enforced';
  exception when raise_exception then
    if sqlerrm not like 'Too many new players%' then raise; end if;
  end;
  -- existing players from the same IP can still play
  perform public.submit_score('00000000-0000-4000-8000-00000000000b', 'bob-secret-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'Bob', 800, 0, 0, 60000);
  raise notice 'PASS 10: max 30 new players per IP per hour; existing players unaffected';
end $$;
reset role;

rollback;
\echo 'ALL LEADERBOARD TESTS PASSED'
