-- Estimate Pro — CAD Studio drawings in the cloud (table cad_drawings).
-- Run once in Supabase → SQL Editor. Each user sees and changes only their own drawings.
create table if not exists public.cad_drawings (
  id         text primary key,
  owner      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name       text,
  kind       text default '2d',
  data       jsonb,
  units      text,
  ents       integer default 0,
  thumb      text,
  updated_at timestamptz not null default now()
);
create index if not exists cad_drawings_owner_idx on public.cad_drawings (owner, updated_at desc);

alter table public.cad_drawings enable row level security;
drop policy if exists "cad own read"   on public.cad_drawings;
drop policy if exists "cad own insert" on public.cad_drawings;
drop policy if exists "cad own update" on public.cad_drawings;
drop policy if exists "cad own delete" on public.cad_drawings;
create policy "cad own read"   on public.cad_drawings for select using (owner = auth.uid());
create policy "cad own insert" on public.cad_drawings for insert with check (owner = auth.uid());
create policy "cad own update" on public.cad_drawings for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy "cad own delete" on public.cad_drawings for delete using (owner = auth.uid());

-- keep updated_at current on every save
create or replace function public.cad_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists cad_touch on public.cad_drawings;
create trigger cad_touch before insert or update on public.cad_drawings for each row execute function public.cad_touch();

-- make the new table visible to the app at once
notify pgrst, 'reload schema';
