-- fights table
create table public.fights (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  opponent_name text not null,
  weapon_category text not null,
  result text not null,
  date date not null,
  gear_set_id uuid references public.gear_sets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fights enable row level security;

create policy "fights_select" on public.fights
  for select using (auth.uid() = user_id);

create policy "fights_insert" on public.fights
  for insert with check (auth.uid() = user_id);

create policy "fights_update" on public.fights
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "fights_delete" on public.fights
  for delete using (auth.uid() = user_id);

create trigger handle_updated_at
  before update on public.fights
  for each row execute procedure public.set_updated_at();
