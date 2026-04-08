-- Post Schedule table (separate from content_items/video tracking)
create table if not exists post_schedule (
  id uuid default uuid_generate_v4() primary key,
  client_id uuid references clients(id) on delete cascade not null,
  post_date date not null,
  label text,
  status text default 'scheduled' check (status in ('scheduled', 'posted', 'missed')),
  created_at timestamptz default now()
);

alter table post_schedule enable row level security;

create policy "Owners and managers manage post_schedule" on post_schedule
  for all using (get_my_role() in ('owner', 'manager'));

create policy "Others read post_schedule" on post_schedule
  for select using (get_my_role() in ('editor', 'videographer', 'researcher'));
