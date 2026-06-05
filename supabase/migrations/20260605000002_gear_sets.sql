-- gear_sets table
create table public.gear_sets (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gear_sets enable row level security;

create policy "gear_sets_select" on public.gear_sets
  for select using (auth.uid() = user_id);

create policy "gear_sets_insert" on public.gear_sets
  for insert with check (auth.uid() = user_id);

create policy "gear_sets_update" on public.gear_sets
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "gear_sets_delete" on public.gear_sets
  for delete using (auth.uid() = user_id);

create trigger handle_updated_at
  before update on public.gear_sets
  for each row execute procedure public.set_updated_at();

-- gear_set_compositions join table (many-to-many between gear_sets and gear_items)
create table public.gear_set_compositions (
  id uuid not null default gen_random_uuid() primary key,
  gear_set_id uuid not null references public.gear_sets(id) on delete cascade,
  gear_item_id uuid not null references public.gear_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (gear_set_id, gear_item_id)
);

alter table public.gear_set_compositions enable row level security;

create policy "gear_set_compositions_select" on public.gear_set_compositions
  for select using (
    exists (
      select 1 from public.gear_sets
      where gear_sets.id = gear_set_compositions.gear_set_id
        and gear_sets.user_id = auth.uid()
    )
  );

create policy "gear_set_compositions_insert" on public.gear_set_compositions
  for insert with check (
    exists (
      select 1 from public.gear_sets
      where gear_sets.id = gear_set_compositions.gear_set_id
        and gear_sets.user_id = auth.uid()
    )
  );

create policy "gear_set_compositions_delete" on public.gear_set_compositions
  for delete using (
    exists (
      select 1 from public.gear_sets
      where gear_sets.id = gear_set_compositions.gear_set_id
        and gear_sets.user_id = auth.uid()
    )
  );
