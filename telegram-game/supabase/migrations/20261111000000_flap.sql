-- Portal Flight (Telegram game widget): players, open runs and bot config.
-- Row level security is on with no policies, so only the service role (the Edge Function) can touch these.

create table public.flap_players (
  user_id     bigint primary key,
  name        text not null default '',
  username    text,
  best        integer not null default 0,
  best_at     timestamptz,
  referred_by bigint,
  played      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index flap_players_rank on public.flap_players (best desc, best_at);
create index flap_players_friends on public.flap_players (referred_by) where played;

create table public.flap_runs (
  user_id    bigint primary key references public.flap_players (user_id) on delete cascade,
  started_at timestamptz not null
);

create table public.flap_config (
  key   text primary key,
  value text not null
);

alter table public.flap_players enable row level security;
alter table public.flap_runs enable row level security;
alter table public.flap_config enable row level security;
revoke all on public.flap_players, public.flap_runs, public.flap_config from anon, authenticated;

-- Creates the player or refreshes the name. The referrer is stored only on creation. Returns true for a new player.
create function public.flap_upsert_player(p_id bigint, p_name text, p_username text, p_ref bigint)
returns boolean language sql security invoker set search_path = '' as $$
  insert into public.flap_players (user_id, name, username, referred_by)
  values (p_id, p_name, p_username, p_ref)
  on conflict (user_id) do update set name = excluded.name, username = excluded.username
  returning (xmax = 0);
$$;

create function public.flap_start_run(p_id bigint, p_at timestamptz)
returns void language sql security invoker set search_path = '' as $$
  update public.flap_players set played = true where user_id = p_id and not played;
  insert into public.flap_runs (user_id, started_at) values (p_id, p_at)
  on conflict (user_id) do update set started_at = excluded.started_at;
$$;

-- Returns the open run's start and removes it, so one run yields at most one result.
create function public.flap_take_run(p_id bigint)
returns timestamptz language sql security invoker set search_path = '' as $$
  delete from public.flap_runs where user_id = p_id returning started_at;
$$;

create function public.flap_friends(p_id bigint)
returns integer language sql stable security invoker set search_path = '' as $$
  select count(*)::integer from public.flap_players where referred_by = p_id and played;
$$;

-- Best score and rank among all players; ties go to whoever got there first.
create function public.flap_player(p_id bigint)
returns table (best integer, place integer) language sql stable security invoker set search_path = '' as $$
  select me.best,
         (select count(*)::integer + 1 from public.flap_players o
           where o.best > me.best or (o.best = me.best and o.best_at < me.best_at))
  from public.flap_players me where me.user_id = p_id;
$$;

-- Raises the player's best only when the new result beats it, then reports best and rank.
create function public.flap_submit(p_id bigint, p_final integer, p_at timestamptz)
returns table (best integer, place integer) language sql security invoker set search_path = '' as $$
  update public.flap_players set best = p_final, best_at = p_at where user_id = p_id and p_final > best;
  select * from public.flap_player(p_id);
$$;

create function public.flap_top()
returns table (id bigint, name text, best integer) language sql stable security invoker set search_path = '' as $$
  select user_id, name, best from public.flap_players where best > 0 order by best desc, best_at limit 10;
$$;

revoke execute on function
  public.flap_upsert_player(bigint, text, text, bigint),
  public.flap_start_run(bigint, timestamptz),
  public.flap_take_run(bigint),
  public.flap_friends(bigint),
  public.flap_player(bigint),
  public.flap_submit(bigint, integer, timestamptz),
  public.flap_top()
from public, anon, authenticated;
grant execute on function
  public.flap_upsert_player(bigint, text, text, bigint),
  public.flap_start_run(bigint, timestamptz),
  public.flap_take_run(bigint),
  public.flap_friends(bigint),
  public.flap_player(bigint),
  public.flap_submit(bigint, integer, timestamptz),
  public.flap_top()
to service_role;
