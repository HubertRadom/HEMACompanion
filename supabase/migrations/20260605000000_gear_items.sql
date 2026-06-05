create table public.gear_items (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null,
  brand text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gear_items enable row level security;

create policy "gear_items_select" on public.gear_items
  for select using (auth.uid() = user_id);

create policy "gear_items_insert" on public.gear_items
  for insert with check (auth.uid() = user_id);

create policy "gear_items_update" on public.gear_items
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "gear_items_delete" on public.gear_items
  for delete using (auth.uid() = user_id);
