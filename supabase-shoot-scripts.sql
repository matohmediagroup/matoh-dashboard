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

create policy "Authenticated users manage shoot_scripts" on shoot_scripts
  for all using (auth.role() = 'authenticated');
