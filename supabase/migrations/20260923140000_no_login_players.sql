-- =============================================================================
-- DiliJump v1.2 — leaderboard WITHOUT any login (no Supabase Auth)
--
-- Identity now lives in the player's browser:
--   player_id  (uuid)    public — shown in the leaderboard data
--   secret     (random)  private — kept in localStorage, never stored in clear
--
-- The database stores only sha256(secret) in a private table. Every write
-- (submit / rename) must present the matching secret, so nobody can post
-- scores as someone else — without accounts, emails or anonymous sign-ins.
--
-- Supersedes the auth-based functions from 20260923120000. Safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Decouple players from Supabase Auth
--    (The old auth-based functions are left in place so an already-deployed
--     v1.1 site keeps working until v1.2 is live. Remove them afterwards with
--     supabase/snippets/drop_legacy_auth.sql.)
-- ---------------------------------------------------------------------------
alter table public.players drop constraint if exists players_id_fkey;

-- ---------------------------------------------------------------------------
-- 2. Private secrets table (no client access at all)
-- ---------------------------------------------------------------------------
create table if not exists public.player_secrets (
  player_id   uuid primary key references public.players (id) on delete cascade,
  secret_hash text        not null,
  ip_hash     text,                         -- sha256 of creator IP, for abuse limits
  created_at  timestamptz not null default now()
);

comment on table public.player_secrets is 'DiliJump: sha256 of each browser''s player secret. Never readable by clients.';

create index if not exists player_secrets_ip_created_idx on public.player_secrets (ip_hash, created_at desc);

alter table public.player_secrets enable row level security;
revoke all on public.player_secrets from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------
create or replace function public.hash_secret(p_secret text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_secret, 'UTF8')), 'hex');
$$;

-- Client IP from PostgREST request headers (null when unavailable).
create or replace function public.request_ip_hash()
returns text
language sql
stable
set search_path = ''
as $$
  select case when ip = '' then null else encode(sha256(convert_to(ip, 'UTF8')), 'hex') end
  from (
    select btrim(split_part(coalesce(
      nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1)) as ip
  ) h;
$$;

-- Verify (or register) a browser identity. Returns nothing; raises on failure.
create or replace function public.authorize_player(p_player_id uuid, p_secret text, p_name text, p_create boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash    text;
  v_ip_hash text;
begin
  if p_player_id is null or p_secret is null or char_length(p_secret) not between 32 and 128 then
    raise exception 'Invalid player credentials' using errcode = '28000';
  end if;

  select s.secret_hash into v_hash from public.player_secrets s where s.player_id = p_player_id;

  if v_hash is not null then
    if v_hash <> public.hash_secret(p_secret) then
      raise exception 'Invalid player credentials' using errcode = '28000';
    end if;
    return;
  end if;

  -- Rows from the old auth-based version have no secret and can't be claimed.
  if exists (select 1 from public.players p where p.id = p_player_id) or not p_create then
    raise exception 'Unknown player' using errcode = '28000';
  end if;

  -- Abuse limit: at most 30 new players per IP per hour.
  v_ip_hash := public.request_ip_hash();
  if v_ip_hash is not null and (
    select count(*) from public.player_secrets s
    where s.ip_hash = v_ip_hash and s.created_at > now() - interval '1 hour'
  ) >= 30 then
    raise exception 'Too many new players from this network, try later' using errcode = 'P0001';
  end if;

  insert into public.players (id, name) values (p_player_id, p_name);
  insert into public.player_secrets (player_id, secret_hash, ip_hash)
  values (p_player_id, public.hash_secret(p_secret), v_ip_hash);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. RPC: submit a finished run — keeps only the highest score per player
-- ---------------------------------------------------------------------------
create or replace function public.submit_score(
  p_player_id   uuid,
  p_secret      text,
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
  v_name      text := public.clean_player_name(p_name);
  v_prev_best integer;
  v_last_run  timestamptz;
  v_best      integer;
  v_best_at   timestamptz;
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

  select p.best_score into v_prev_best from public.players p where p.id = p_player_id;

  update public.players p set
    name         = v_name,
    games_played = p.games_played + 1,
    total_coins  = p.total_coins + p_coins,
    best_coins   = case when p_score > p.best_score then p_coins           else p.best_coins  end,
    best_height  = case when p_score > p.best_score then p_height          else p.best_height end,
    best_at      = case when p_score > p.best_score then clock_timestamp() else p.best_at     end,
    best_score   = greatest(p.best_score, p_score),
    updated_at   = now()
  where p.id = p_player_id
  returning p.best_score, p.best_at into v_best, v_best_at;

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
      ) else null end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. RPC: rename (name bar edited) — requires the secret
-- ---------------------------------------------------------------------------
create or replace function public.rename_player(p_player_id uuid, p_secret text, p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := public.clean_player_name(p_name);
begin
  if char_length(v_name) < 2 then
    raise exception 'Invalid player name' using errcode = '22023';
  end if;
  perform public.authorize_player(p_player_id, p_secret, v_name, false);
  update public.players set name = v_name, updated_at = now() where id = p_player_id;
  return v_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. RPC: a player's own row + rank (public info, no secret needed)
-- ---------------------------------------------------------------------------
create or replace function public.get_player_rank(p_player_id uuid)
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
  where me.id = p_player_id and me.best_score > 0;
$$;

-- ---------------------------------------------------------------------------
-- 7. Permissions — the publishable (anon) key is all the game needs
-- ---------------------------------------------------------------------------
revoke all on function public.hash_secret(text)                             from public, anon, authenticated;
revoke all on function public.request_ip_hash()                             from public, anon, authenticated;
revoke all on function public.authorize_player(uuid, text, text, boolean)   from public, anon, authenticated;
revoke all on function public.submit_score(uuid, text, text, integer, integer, integer, integer) from public;
revoke all on function public.rename_player(uuid, text, text)               from public;
revoke all on function public.get_player_rank(uuid)                         from public;

grant execute on function public.submit_score(uuid, text, text, integer, integer, integer, integer) to anon, authenticated;
grant execute on function public.rename_player(uuid, text, text)            to anon, authenticated;
grant execute on function public.get_player_rank(uuid)                      to anon, authenticated;
grant execute on function public.get_leaderboard(integer)                   to anon, authenticated;
-- public.players stays publicly readable (RLS select policy) for the board + realtime.
