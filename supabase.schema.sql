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

create index if not exists kickoff_records_user_updated_idx
  on public.kickoff_records (user_id, updated_at desc);

create index if not exists kickoff_records_scope_score_idx
  on public.kickoff_records (season_key, friend_code, total_score desc);

create index if not exists kickoff_records_total_score_idx
  on public.kickoff_records (total_score desc)
  where total_score is not null;

create table if not exists public.kickoff_mode_runs (
  id text primary key,
  user_id text not null,
  email text not null,
  display_name text not null,
  location text not null,
  friend_code text not null default 'global',
  season_key text not null default 'world-cup-run',
  mode_id text not null,
  status text not null,
  score integer,
  mode_run jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.kickoff_mode_runs enable row level security;

create policy "users can read public mode proof runs"
  on public.kickoff_mode_runs
  for select
  using (true);

create policy "users can upsert their own mode proof runs"
  on public.kickoff_mode_runs
  for all
  using (auth.uid()::text = user_id or auth.jwt() ->> 'email' = email)
  with check (auth.uid()::text = user_id or auth.jwt() ->> 'email' = email);

create index if not exists kickoff_mode_runs_user_updated_idx
  on public.kickoff_mode_runs (user_id, updated_at desc);

create index if not exists kickoff_mode_runs_scope_score_idx
  on public.kickoff_mode_runs (season_key, friend_code, score desc);

create or replace view public.kickoff_leaderboard as
with aggregate_rows as (
  select
    user_id as id,
    season_key,
    friend_code,
    max(display_name) as display_name,
    max(location) as location,
    count(*)::integer as locks,
    count(*) filter (where result is not null)::integer as revealed,
    coalesce(round(avg(total_score) filter (where total_score is not null))::integer, 0) as average_score,
    coalesce(max(total_score), 0)::integer as best_score,
    count(*) filter (
      where result is not null
        and coalesce(nullif(result #>> '{breakdown,exactScore}', '')::integer, 0) > 0
    )::integer as exact_hits,
    count(*) filter (
      where capsule #>> '{filecoinProof,mode}' = 'real'
        and capsule #>> '{filecoinProof,proofStatus}' in ('retrievable', 'verified')
    )::integer as verified_proofs,
    (count(*) * 120 + coalesce(sum(total_score), 0))::integer as xp,
    max(updated_at) as updated_at
  from public.kickoff_records
  group by user_id, season_key, friend_code
),
ordered_results as (
  select
    user_id as id,
    season_key,
    friend_code,
    coalesce(nullif(result #>> '{breakdown,winner}', '')::integer, 0) > 0 as winner_hit,
    row_number() over (
      partition by user_id, season_key, friend_code
      order by coalesce((result ->> 'revealedAt')::timestamptz, updated_at) desc
    ) as reveal_rank
  from public.kickoff_records
  where result is not null
),
first_misses as (
  select
    id,
    season_key,
    friend_code,
    min(reveal_rank) filter (where winner_hit = false) as first_miss_rank
  from ordered_results
  group by id, season_key, friend_code
),
streak_rows as (
  select
    ordered_results.id,
    ordered_results.season_key,
    ordered_results.friend_code,
    count(*) filter (
      where ordered_results.winner_hit
        and ordered_results.reveal_rank < coalesce(first_misses.first_miss_rank, 2147483647)
    )::integer as streak
  from ordered_results
  left join first_misses
    on first_misses.id = ordered_results.id
   and first_misses.season_key = ordered_results.season_key
   and first_misses.friend_code = ordered_results.friend_code
  group by ordered_results.id, ordered_results.season_key, ordered_results.friend_code
)
select
  aggregate_rows.id,
  aggregate_rows.season_key,
  aggregate_rows.friend_code,
  aggregate_rows.display_name,
  aggregate_rows.location,
  aggregate_rows.locks,
  aggregate_rows.average_score,
  aggregate_rows.best_score,
  aggregate_rows.xp,
  coalesce(streak_rows.streak, 0)::integer as streak,
  aggregate_rows.revealed,
  aggregate_rows.exact_hits,
  aggregate_rows.verified_proofs,
  dense_rank() over (order by aggregate_rows.xp desc, aggregate_rows.best_score desc, aggregate_rows.updated_at asc)::integer as rank,
  aggregate_rows.updated_at
from aggregate_rows
left join streak_rows
  on streak_rows.id = aggregate_rows.id
 and streak_rows.season_key = aggregate_rows.season_key
 and streak_rows.friend_code = aggregate_rows.friend_code
order by aggregate_rows.xp desc, aggregate_rows.best_score desc, aggregate_rows.updated_at asc;

comment on view public.kickoff_leaderboard is
  'Public ranking view for Kickoff Lock Agent. Supports global, friend_code and season_key filters with locks, revealed proofs, exact hits, verified Filecoin proofs, XP and current winner streak.';
