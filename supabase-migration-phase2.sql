-- ============================================================
-- MATOH MEDIA GROUP — PHASE 2 SCHEMA MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================================

-- Social accounts (TikTok, Instagram, YouTube handles per client)
create table if not exists social_accounts (
  id uuid default uuid_generate_v4() primary key,
  client_id uuid references clients(id) on delete cascade not null,
  platform text not null check (platform in ('tiktok', 'instagram', 'youtube')),
  handle text not null,  -- e.g. @vwpacific or channel ID for YouTube
  created_at timestamptz default now(),
  unique(client_id, platform)
);

-- Cached social stats (refreshed via Apify / YouTube API)
create table if not exists social_stats (
  id uuid default uuid_generate_v4() primary key,
  client_id uuid references clients(id) on delete cascade not null,
  platform text not null check (platform in ('tiktok', 'instagram', 'youtube')),
  followers int default 0,
  total_views bigint default 0,
  avg_views int default 0,
  post_count int default 0,
  latest_videos jsonb default '[]',  -- array of {title, views, likes, comments, url, thumbnail, date}
  refreshed_at timestamptz default now(),
  unique(client_id, platform)
);

-- SOP Library
create table if not exists sops (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  category text not null check (category in ('Filming', 'Editing', 'Client', 'Operations', 'Onboarding', 'Other')),
  description text,
  pdf_url text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Generated scripts (from dealer-scripter, stored locally for quick access)
create table if not exists generated_scripts (
  id uuid default uuid_generate_v4() primary key,
  client_id uuid references clients(id) on delete cascade not null,
  dealer_key text not null,
  run_date timestamptz default now(),
  scripts jsonb not null default '[]',  -- full array from dealer-scripter response
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'error')),
  job_id text,
  created_at timestamptz default now()
);

-- Updated_at triggers
create trigger trg_sops_updated_at before update on sops for each row execute function set_updated_at();

-- RLS
alter table social_accounts enable row level security;
alter table social_stats enable row level security;
alter table sops enable row level security;
alter table generated_scripts enable row level security;

-- Social accounts — owners + managers can manage, others read
create policy "Owners and managers manage social_accounts" on social_accounts
  for all using (get_my_role() in ('owner', 'manager'));
create policy "Others read social_accounts" on social_accounts
  for select using (get_my_role() in ('editor', 'videographer', 'researcher'));

-- Social stats — all authenticated can read, owners + managers can write
create policy "Owners and managers manage social_stats" on social_stats
  for all using (get_my_role() in ('owner', 'manager'));
create policy "Others read social_stats" on social_stats
  for select using (get_my_role() in ('editor', 'videographer', 'researcher'));

-- SOPs — owners + managers full access, others read
create policy "Owners and managers manage sops" on sops
  for all using (get_my_role() in ('owner', 'manager'));
create policy "Others read sops" on sops
  for select using (get_my_role() in ('editor', 'videographer', 'researcher'));

-- Generated scripts — owners + managers full access
create policy "Owners and managers manage generated_scripts" on generated_scripts
  for all using (get_my_role() in ('owner', 'manager'));

-- Realtime
alter publication supabase_realtime add table social_stats;
alter publication supabase_realtime add table generated_scripts;

-- Storage buckets (run separately if needed)
-- insert into storage.buckets (id, name, public) values ('sops', 'sops', true) on conflict do nothing;
