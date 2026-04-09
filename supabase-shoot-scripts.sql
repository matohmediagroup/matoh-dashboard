-- Shot list / scripts per shoot
create table if not exists shoot_scripts (
  id uuid default uuid_generate_v4() primary key,
  shoot_id uuid references shoots(id) on delete cascade not null,
  content text not null,
  order_num int default 0,
  done boolean default false,
  created_at timestamptz default now()
);

alter table shoot_scripts enable row level security;

drop policy if exists "Authenticated users manage shoot_scripts" on shoot_scripts;
create policy "Authenticated users manage shoot_scripts" on shoot_scripts
  for all using (auth.role() = 'authenticated');

-- Add PDF columns to shoots table
alter table shoots add column if not exists pdf_url text;
alter table shoots add column if not exists pdf_name text;

-- Storage bucket for shoot PDFs
insert into storage.buckets (id, name, public)
values ('shoot-pdfs', 'shoot-pdfs', true)
on conflict (id) do nothing;

-- Storage policy
drop policy if exists "Authenticated users manage shoot-pdfs" on storage.objects;
create policy "Authenticated users manage shoot-pdfs" on storage.objects
  for all using (bucket_id = 'shoot-pdfs' and auth.role() = 'authenticated');
