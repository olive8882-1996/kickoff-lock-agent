create table if not exists public.kickoff_profiles (
  id text primary key,
  email text not null,
  display_name text not null,
  location text not null,
  avatar_url text,
  friend_code text not null default 'global',
  updated_at timestamptz not null default now()
);

alter table public.kickoff_profiles enable row level security;

create policy "users can read public profiles"
  on public.kickoff_profiles
  for select
  using (true);

create policy "users can update their own profile"
  on public.kickoff_profiles
  for all
  using (auth.uid()::text = id or auth.jwt() ->> 'email' = email)
  with check (auth.uid()::text = id or auth.jwt() ->> 'email' = email);

create table if not exists public.kickoff_records (
  id text primary key,
  user_id text not null,
  email text not null,
  display_name text not null,
  location text not null,
  friend_code text not null default 'global',
  season_key text not null default 'world-cup-run',
  capsule jsonb not null,
  result jsonb,
  seal_job jsonb,
  total_score integer,
  updated_at timestamptz not null default now()
);

alter table public.kickoff_records enable row level security;

create policy "users can read public prediction records"
  on public.kickoff_records
  for select
  using (true);

create policy "users can upsert their own records"
  on public.kickoff_records
  for all
  using (auth.uid()::text = user_id or auth.jwt() ->> 'email' = email)
  with check (auth.uid()::text = user_id or auth.jwt() ->> 'email' = email);

create or replace view public.kickoff_leaderboard as
select
  user_id as id,
  max(season_key) as season_key,
  max(friend_code) as friend_code,
  max(display_name) as display_name,
  max(location) as location,
  count(*)::integer as locks,
  coalesce(round(avg(total_score))::integer, 0) as average_score,
  coalesce(max(total_score), 0)::integer as best_score,
  (count(*) * 120 + coalesce(sum(total_score), 0))::integer as xp,
  count(*) filter (
    where result is not null
      and coalesce((result #>> '{breakdown,winner}')::integer, 0) > 0
  )::integer as streak
from public.kickoff_records
group by user_id, season_key, friend_code
order by xp desc;
