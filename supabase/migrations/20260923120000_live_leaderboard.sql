-- =============================================================================
-- DiliJump — live leaderboard
--
-- One row per player (their personal best), keyed by the Supabase Auth user id.
-- Players are identified with Supabase *anonymous sign-ins*, so no email or
-- password is needed and each device/browser counts as one person.
--
-- Writes happen ONLY through the `submit_run` / `set_player_name` functions
-- (SECURITY DEFINER), which validate input and keep the highest score.
-- Clients get read-only access to the table (RLS) and realtime updates.
--
-- Safe to run more than once.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.players (
  id            uuid primary key references auth.users (id) on delete cascade,
  name          text        not null check (char_length(name) between 2 and 16),
  best_score    integer     not null default 0 check (best_score >= 0),
  best_coins    integer     not null default 0 check (best_coins >= 0),
  best_height   integer     not null default 0 check (best_height >= 0),
  best_at       timestamptz,
  games_played  integer     not null default 0,
  total_coins   bigint      not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.players is 'DiliJump: one row per player holding their personal best (the leaderboard).';

-- Leaderboard order: highest score first; ties -> whoever reached it first.
create index if not exists players_leaderboard_idx
  on public.players (best_score desc, best_at asc, id asc)
  where best_score > 0;

create table if not exists public.runs (
  id           bigint generated always as identity primary key,
  player_id    uuid        not null references public.players (id) on delete cascade,
  score        integer     not null check (score >= 0),
  coins        integer     not null check (coins >= 0),
  height       integer     not null check (height >= 0),
  duration_ms  integer     not null check (duration_ms >= 0),
  created_at   timestamptz not null default now()
);

comment on table public.runs is 'DiliJump: history of every submitted run (audit / stats / rate limiting).';

create index if not exists runs_player_created_idx on public.runs (player_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security: public read-only leaderboard, private run history
-- ---------------------------------------------------------------------------

alter table public.players enable row level security;
alter table public.runs    enable row level security;

drop policy if exists "Leaderboard is publicly readable" on public.players;
create policy "Leaderboard is publicly readable"
  on public.players for select
  to anon, authenticated
  using (true);

drop policy if exists "Players can read their own runs" on public.runs;
create policy "Players can read their own runs"
  on public.runs for select
  to authenticated
  using ((select auth.uid()) = player_id);

-- No insert/update/delete policies: direct writes are impossible.
revoke all on public.players from anon, authenticated;
revoke all on public.runs    from anon, authenticated;
grant select on public.players to anon, authenticated;
grant select on public.runs    to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Mirrors sanitizeName() in src/utils/format.js
create or replace function public.clean_player_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(left(
    btrim(regexp_replace(
      regexp_replace(coalesce(p_name, ''), '[[:cntrl:]<>"''`\\]', '', 'g'),
      '\s+', ' ', 'g')),
    16));
$$;

-- ---------------------------------------------------------------------------
-- RPC: submit a finished run. Keeps only the highest score per player.
-- ---------------------------------------------------------------------------

create or replace function public.submit_run(
  p_name        text,
  p_score       integer,
  p_coins       integer,
  p_height      integer,
  p_duration_ms integer
)
returns table (best_score integer, is_best boolean, rank bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_name      text := public.clean_player_name(p_name);
  v_prev_best integer;
  v_last_run  timestamptz;
  v_best      integer;
  v_best_at   timestamptz;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'Invalid player name' using errcode = '22023';
  end if;
  if p_score is null or p_coins is null or p_height is null or p_duration_ms is null
     or p_score < 0 or p_coins < 0 or p_height < 0 or p_duration_ms < 0 then
    raise exception 'Invalid run data' using errcode = '22023';
  end if;

  -- Plausibility check: even spring-chaining climbs < ~300 pts/s.
  -- Generous cap + flat allowance for coin / enemy bonuses.
  if p_score > (p_duration_ms / 1000.0) * 400 + 2000 then
    raise exception 'Implausible score' using errcode = '22023';
  end if;

  -- Basic rate limit: one run every 3 seconds per player.
  select max(r.created_at) into v_last_run from public.runs r where r.player_id = v_uid;
  if v_last_run is not null and v_last_run > now() - interval '3 seconds' then
    raise exception 'Too many submissions, slow down' using errcode = 'P0001';
  end if;

  select p.best_score into v_prev_best from public.players p where p.id = v_uid;

  insert into public.players as p
    (id, name, best_score, best_coins, best_height, best_at, games_played, total_coins)
  values
    (v_uid, v_name, p_score, p_coins, p_height,
     case when p_score > 0 then clock_timestamp() end, 1, p_coins)
  on conflict (id) do update set
    name         = excluded.name,
    games_played = p.games_played + 1,
    total_coins  = p.total_coins + excluded.total_coins,
    best_coins   = case when excluded.best_score > p.best_score then excluded.best_coins  else p.best_coins  end,
    best_height  = case when excluded.best_score > p.best_score then excluded.best_height else p.best_height end,
    best_at      = case when excluded.best_score > p.best_score then clock_timestamp()   else p.best_at     end,
    best_score   = greatest(p.best_score, excluded.best_score),
    updated_at   = now()
  returning p.best_score, p.best_at into v_best, v_best_at;

  insert into public.runs (player_id, score, coins, height, duration_ms)
  values (v_uid, p_score, p_coins, p_height, p_duration_ms);

  return query
    select
      v_best,
      (p_score > 0 and p_score > coalesce(v_prev_best, 0)),
      case when v_best > 0 then (
        select count(*) + 1 from public.players o
        where o.best_score > v_best
           or (o.best_score = v_best and (o.best_at, o.id) < (v_best_at, v_uid))
      ) else null end;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: rename the current player (e.g. after editing the name bar)
-- ---------------------------------------------------------------------------

create or replace function public.set_player_name(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := public.clean_player_name(p_name);
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'Invalid player name' using errcode = '22023';
  end if;
  update public.players set name = v_name, updated_at = now() where id = v_uid;
  return v_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: read the leaderboard (top N, one row = one person's best)
-- ---------------------------------------------------------------------------

create or replace function public.get_leaderboard(p_limit integer default 10)
returns table (
  rank        bigint,
  player_id   uuid,
  name        text,
  best_score  integer,
  best_coins  integer,
  best_height integer,
  best_at     timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    row_number() over (order by p.best_score desc, p.best_at asc, p.id asc) as rank,
    p.id, p.name, p.best_score, p.best_coins, p.best_height, p.best_at
  from public.players p
  where p.best_score > 0
  order by p.best_score desc, p.best_at asc, p.id asc
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
$$;

-- ---------------------------------------------------------------------------
-- RPC: the current player's own leaderboard row + rank
-- ---------------------------------------------------------------------------

create or replace function public.get_my_rank()
returns table (
  rank        bigint,
  player_id   uuid,
  name        text,
  best_score  integer,
  best_coins  integer,
  best_height integer,
  best_at     timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    (select count(*) + 1 from public.players o
      where o.best_score > me.best_score
         or (o.best_score = me.best_score and (o.best_at, o.id) < (me.best_at, me.id))) as rank,
    me.id, me.name, me.best_score, me.best_coins, me.best_height, me.best_at
  from public.players me
  where me.id = auth.uid() and me.best_score > 0;
$$;

-- ---------------------------------------------------------------------------
-- Function permissions
-- ---------------------------------------------------------------------------

revoke all on function public.clean_player_name(text)                          from public, anon, authenticated;
revoke all on function public.submit_run(text, integer, integer, integer, integer) from public, anon;
revoke all on function public.set_player_name(text)                            from public, anon;
revoke all on function public.get_my_rank()                                    from public, anon;

grant execute on function public.submit_run(text, integer, integer, integer, integer) to authenticated;
grant execute on function public.set_player_name(text)                            to authenticated;
grant execute on function public.get_leaderboard(integer)                         to anon, authenticated;
grant execute on function public.get_my_rank()                                    to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: broadcast leaderboard changes to connected clients
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'players'
  ) then
    alter publication supabase_realtime add table public.players;
  end if;
end;
$$;
