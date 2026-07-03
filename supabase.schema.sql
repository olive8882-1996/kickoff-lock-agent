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

create table if not exists public.kickoff_share_artifacts (
  id text not null,
  kind text not null check (kind in ('record', 'mode')),
  user_id text not null,
  email text not null,
  display_name text not null,
  location text not null,
  friend_code text not null default 'global',
  season_key text not null default 'world-cup-run',
  proof_url text not null,
  image_generated boolean not null default false,
  generated_at timestamptz,
  file_name text,
  image_url text,
  image_mime text,
  image_byte_length integer,
  image_hash text,
  x_intent_url text,
  x_intent_opened_at timestamptz,
  native_share_opened_at timestamptz,
  artifact jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (id, kind)
);

alter table public.kickoff_share_artifacts enable row level security;

create policy "users can read public share artifacts"
  on public.kickoff_share_artifacts
  for select
  using (true);

create policy "users can upsert their own share artifacts"
  on public.kickoff_share_artifacts
  for all
  using (auth.uid()::text = user_id or auth.jwt() ->> 'email' = email)
  with check (auth.uid()::text = user_id or auth.jwt() ->> 'email' = email);

create index if not exists kickoff_share_artifacts_user_updated_idx
  on public.kickoff_share_artifacts (user_id, updated_at desc);

create index if not exists kickoff_share_artifacts_scope_idx
  on public.kickoff_share_artifacts (season_key, friend_code, kind);

create index if not exists kickoff_share_artifacts_hash_idx
  on public.kickoff_share_artifacts (kind, image_hash)
  where image_hash is not null;

create index if not exists kickoff_share_artifacts_image_url_idx
  on public.kickoff_share_artifacts (kind, image_url)
  where image_url is not null;

insert into storage.buckets (id, name, public)
values ('kickoff-share-cards', 'kickoff-share-cards', true)
on conflict (id) do update set public = true;

create policy "public can read kickoff share card images"
  on storage.objects
  for select
  using (bucket_id = 'kickoff-share-cards');

create policy "authenticated users can upload kickoff share card images"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'kickoff-share-cards');

create policy "authenticated users can update kickoff share card images"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'kickoff-share-cards')
  with check (bucket_id = 'kickoff-share-cards');

create or replace view public.kickoff_leaderboard as
with record_rows as (
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
mode_rows as (
  select
    user_id as id,
    season_key,
    friend_code,
    max(display_name) as display_name,
    max(location) as location,
    count(*)::integer as mode_proofs,
    (count(*) * 90 + coalesce(sum(score), 0))::integer as mode_xp,
    max(updated_at) as updated_at
  from public.kickoff_mode_runs
  group by user_id, season_key, friend_code
),
aggregate_rows as (
  select
    coalesce(record_rows.id, mode_rows.id) as id,
    coalesce(record_rows.season_key, mode_rows.season_key) as season_key,
    coalesce(record_rows.friend_code, mode_rows.friend_code) as friend_code,
    coalesce(record_rows.display_name, mode_rows.display_name) as display_name,
    coalesce(record_rows.location, mode_rows.location) as location,
    coalesce(record_rows.locks, 0)::integer as locks,
    coalesce(record_rows.revealed, 0)::integer as revealed,
    coalesce(record_rows.average_score, 0)::integer as average_score,
    coalesce(record_rows.best_score, 0)::integer as best_score,
    coalesce(record_rows.exact_hits, 0)::integer as exact_hits,
    coalesce(record_rows.verified_proofs, 0)::integer as verified_proofs,
    coalesce(mode_rows.mode_proofs, 0)::integer as mode_proofs,
    (coalesce(record_rows.xp, 0) + coalesce(mode_rows.mode_xp, 0))::integer as xp,
    greatest(
      coalesce(record_rows.updated_at, 'epoch'::timestamptz),
      coalesce(mode_rows.updated_at, 'epoch'::timestamptz)
    ) as updated_at
  from record_rows
  full outer join mode_rows
    on mode_rows.id = record_rows.id
   and mode_rows.season_key = record_rows.season_key
   and mode_rows.friend_code = record_rows.friend_code
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
  aggregate_rows.mode_proofs,
  dense_rank() over (order by aggregate_rows.xp desc, aggregate_rows.best_score desc, aggregate_rows.updated_at asc)::integer as rank,
  aggregate_rows.updated_at
from aggregate_rows
left join streak_rows
  on streak_rows.id = aggregate_rows.id
 and streak_rows.season_key = aggregate_rows.season_key
 and streak_rows.friend_code = aggregate_rows.friend_code
order by aggregate_rows.xp desc, aggregate_rows.best_score desc, aggregate_rows.updated_at asc;

comment on view public.kickoff_leaderboard is
  'Public ranking view for Kickoff Lock Agent. Supports global, friend_code and season_key filters with locks, revealed proofs, mode proofs, exact hits, verified Filecoin proofs, XP and current winner streak.';

create or replace view public.kickoff_backend_health as
with required_tables as (
  select unnest(array[
    'kickoff_profiles',
    'kickoff_records',
    'kickoff_mode_runs',
    'kickoff_share_artifacts'
  ]) as name
),
required_views as (
  select unnest(array[
    'kickoff_leaderboard',
    'kickoff_backend_health'
  ]) as name
),
required_rls as (
  select name from required_tables
),
existing_tables as (
  select table_name as name
  from information_schema.tables
  where table_schema = 'public'
    and table_type = 'BASE TABLE'
),
existing_views as (
  select table_name as name
  from information_schema.views
  where table_schema = 'public'
),
rls_enabled as (
  select relname as name
  from pg_class
  join pg_namespace on pg_namespace.oid = pg_class.relnamespace
  where pg_namespace.nspname = 'public'
    and pg_class.relrowsecurity
),
policy_rows as (
  select count(*)::integer as policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'kickoff_profiles',
      'kickoff_records',
      'kickoff_mode_runs',
      'kickoff_share_artifacts'
    )
),
summary as (
  select
    array(select name from required_tables order by name) as required_tables,
    array(
      select required_tables.name
      from required_tables
      left join existing_tables on existing_tables.name = required_tables.name
      where existing_tables.name is null
      order by required_tables.name
    ) as missing_tables,
    array(select name from required_views order by name) as required_views,
    array(
      select required_views.name
      from required_views
      left join existing_views on existing_views.name = required_views.name
      where existing_views.name is null
      order by required_views.name
    ) as missing_views,
    array(select name from required_rls order by name) as rls_tables,
    array(
      select required_rls.name
      from required_rls
      left join rls_enabled on rls_enabled.name = required_rls.name
      where rls_enabled.name is null
      order by required_rls.name
    ) as missing_rls_tables,
    policy_rows.policy_count,
    8::integer as required_policy_count
  from policy_rows
)
select
  '2026-07-03-cloud-v2'::text as schema_version,
  now() as checked_at,
  required_tables,
  missing_tables,
  required_views,
  missing_views,
  rls_tables,
  missing_rls_tables,
  policy_count,
  required_policy_count,
  (
    cardinality(missing_tables) = 0
    and cardinality(missing_views) = 0
    and cardinality(missing_rls_tables) = 0
    and policy_count >= required_policy_count
  ) as ready,
  format(
    'tables missing %s, views missing %s, RLS missing %s, policies %s/%s',
    cardinality(missing_tables),
    cardinality(missing_views),
    cardinality(missing_rls_tables),
    policy_count,
    required_policy_count
  ) as detail
from summary;

comment on view public.kickoff_backend_health is
  'Public backend health row for Kickoff Lock Agent. Verifies required tables, views, RLS and policy count for production account sync.';

grant usage on schema public to anon, authenticated;
grant select on public.kickoff_profiles to anon, authenticated;
grant select on public.kickoff_records to anon, authenticated;
grant select on public.kickoff_mode_runs to anon, authenticated;
grant select on public.kickoff_share_artifacts to anon, authenticated;
grant insert, update, delete on public.kickoff_profiles to authenticated;
grant insert, update, delete on public.kickoff_records to authenticated;
grant insert, update, delete on public.kickoff_mode_runs to authenticated;
grant insert, update, delete on public.kickoff_share_artifacts to authenticated;
grant select on public.kickoff_leaderboard to anon, authenticated;
grant select on public.kickoff_backend_health to anon, authenticated;
