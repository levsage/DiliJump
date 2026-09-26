-- =============================================================================
-- DiliJump v3.0 — player levels
--
-- Every point scored (all runs added together) is XP; the level grows with it
-- and is shown next to the name on the leaderboard.
--
--   players.total_score        lifetime XP (sum of all submitted run scores)
--   public.player_level_xp(L)  XP needed to reach level L
--   public.player_level(xp)    level for a total      (mirrors src/systems/PlayerLevel.js)
--
-- submit_score / get_leaderboard / get_player_rank now also return
-- total_score + level. Arguments are unchanged, so older game versions keep
-- working (they simply ignore the new columns).
--
-- Safe to run more than once. Paste into Supabase → SQL Editor → Run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Lifetime XP column, back-filled from the run history
-- ---------------------------------------------------------------------------
alter table public.players add column if not exists total_score bigint not null default 0;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'players_total_score_check') then
    alter table public.players add constraint players_total_score_check check (total_score >= 0);
  end if;
end $$;

comment on column public.players.total_score is 'DiliJump: lifetime XP = sum of the scores of all runs (drives the player level).';

-- Existing players keep every point they ever scored (idempotent: never lowers a total).
update public.players p
set total_score = greatest(p.total_score, p.best_score, coalesce(r.total, 0))
from (
  select pl.id, (select sum(x.score) from public.runs x where x.player_id = pl.id) as total
  from public.players pl
) r
where r.id = p.id
  and p.total_score < greatest(p.best_score, coalesce(r.total, 0));

-- ---------------------------------------------------------------------------
-- 2. Level formula — keep in sync with LEVELS in src/config/constants.js
--    xp(L) = 1000·(L−1) + 500·(L−1)(L−2)/2
-- ---------------------------------------------------------------------------
create or replace function public.player_level_xp(p_level integer)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case when p_level <= 1 then 0::bigint
    else (1000::bigint * (p_level - 1) + 250::bigint * (p_level - 1) * (p_level - 2)) end;
$$;

create or replace function public.player_level(p_total bigint)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  n integer;
begin
  if p_total is null or p_total <= 0 then
    return 1;
  end if;
  -- closed form of the inverse, then correct any rounding
  n := floor((-750.0 + sqrt(562500.0 + 1000.0 * p_total)) / 500.0);
  while public.player_level_xp(n + 2) <= p_total loop n := n + 1; end loop;
  while n > 0 and public.player_level_xp(n + 1) > p_total loop n := n - 1; end loop;
  return n + 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. submit_score: also adds the run to the lifetime XP and returns the level
-- ---------------------------------------------------------------------------
drop function if exists public.submit_score(uuid, text, text, integer, integer, integer, integer);

create function public.submit_score(
  p_player_id   uuid,
  p_secret      text,
  p_name        text,
  p_score       integer,
  p_coins       integer,
  p_height      integer,
  p_duration_ms integer
)
returns table (
  best_score  integer,
  is_best     boolean,
  rank        bigint,
  total_score bigint,
  level       integer,
  prev_level  integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name       text := public.clean_player_name(p_name);
  v_prev_best  integer;
  v_prev_total bigint;
  v_last_run   timestamptz;
  v_best       integer;
  v_best_at    timestamptz;
  v_total      bigint;
begin
  if char_length(v_name) < 2 then
    raise exception 'Invalid player name' using errcode = '22023';
  end if;
  if p_score is null or p_coins is null or p_height is null or p_duration_ms is null
     or p_score < 0 or p_coins < 0 or p_height < 0 or p_duration_ms < 0 then
    raise exception 'Invalid run data' using errcode = '22023';
  end if;
  -- Plausibility: spring-chaining climbs < ~300 pts/s; flat allowance for bonuses.
  if p_score > (p_duration_ms / 1000.0) * 400 + 2000 then
    raise exception 'Implausible score' using errcode = '22023';
  end if;

  perform public.authorize_player(p_player_id, p_secret, v_name, true);

  -- One run every 3 seconds per player.
  select max(r.created_at) into v_last_run from public.runs r where r.player_id = p_player_id;
  if v_last_run is not null and v_last_run > now() - interval '3 seconds' then
    raise exception 'Too many submissions, slow down' using errcode = 'P0001';
  end if;

  select p.best_score, p.total_score into v_prev_best, v_prev_total
  from public.players p where p.id = p_player_id;

  update public.players p set
    name         = v_name,
    games_played = p.games_played + 1,
    total_coins  = p.total_coins + p_coins,
    total_score  = p.total_score + p_score,
    best_coins   = case when p_score > p.best_score then p_coins           else p.best_coins  end,
    best_height  = case when p_score > p.best_score then p_height          else p.best_height end,
    best_at      = case when p_score > p.best_score then clock_timestamp() else p.best_at     end,
    best_score   = greatest(p.best_score, p_score),
    updated_at   = now()
  where p.id = p_player_id
  returning p.best_score, p.best_at, p.total_score into v_best, v_best_at, v_total;

  insert into public.runs (player_id, score, coins, height, duration_ms)
  values (p_player_id, p_score, p_coins, p_height, p_duration_ms);

  return query
    select
      v_best,
      (p_score > 0 and p_score > coalesce(v_prev_best, 0)),
      case when v_best > 0 then (
        select count(*) + 1 from public.players o
        where o.best_score > v_best
           or (o.best_score = v_best and (o.best_at, o.id) < (v_best_at, p_player_id))
      ) else null end,
      v_total,
      public.player_level(v_total),
      public.player_level(coalesce(v_prev_total, 0));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Leaderboard reads: + total_score, level
-- ---------------------------------------------------------------------------
drop function if exists public.get_leaderboard(integer);

create function public.get_leaderboard(p_limit integer default 10)
returns table (
  rank        bigint,
  player_id   uuid,
  name        text,
  best_score  integer,
  best_coins  integer,
  best_height integer,
  best_at     timestamptz,
  total_score bigint,
  level       integer
)
language sql
stable
set search_path = ''
as $$
  select
    row_number() over (order by p.best_score desc, p.best_at asc, p.id asc) as rank,
    p.id, p.name, p.best_score, p.best_coins, p.best_height, p.best_at,
    p.total_score, public.player_level(p.total_score)
  from public.players p
  where p.best_score > 0
  order by p.best_score desc, p.best_at asc, p.id asc
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
$$;

drop function if exists public.get_player_rank(uuid);

create function public.get_player_rank(p_player_id uuid)
returns table (
  rank        bigint,
  player_id   uuid,
  name        text,
  best_score  integer,
  best_coins  integer,
  best_height integer,
  best_at     timestamptz,
  total_score bigint,
  level       integer
)
language sql
stable
set search_path = ''
as $$
  select
    (select count(*) + 1 from public.players o
      where o.best_score > me.best_score
         or (o.best_score = me.best_score and (o.best_at, o.id) < (me.best_at, me.id))) as rank,
    me.id, me.name, me.best_score, me.best_coins, me.best_height, me.best_at,
    me.total_score, public.player_level(me.total_score)
  from public.players me
  where me.id = p_player_id and me.best_score > 0;
$$;

-- ---------------------------------------------------------------------------
-- 5. Permissions (dropped functions lose their grants)
-- ---------------------------------------------------------------------------
revoke all on function public.submit_score(uuid, text, text, integer, integer, integer, integer) from public;
revoke all on function public.get_leaderboard(integer)                    from public;
revoke all on function public.get_player_rank(uuid)                       from public;

grant execute on function public.submit_score(uuid, text, text, integer, integer, integer, integer) to anon, authenticated;
grant execute on function public.get_leaderboard(integer)                 to anon, authenticated;
grant execute on function public.get_player_rank(uuid)                    to anon, authenticated;
grant execute on function public.player_level(bigint)                     to anon, authenticated;
grant execute on function public.player_level_xp(integer)                 to anon, authenticated;
