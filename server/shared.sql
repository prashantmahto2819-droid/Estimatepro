-- Estimate Pro — shared library and module switches (run once in Supabase → SQL editor; safe to run again).
-- 1) shared_lib: blocks and hatch patterns the administrators publish for every user of the app.
-- 2) ep_switches: modules (tabs) the super admin has switched off for ordinary users.

create or replace function public.ep_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('super_admin', 'admin'));
$$;

create table if not exists public.shared_lib (
  id   bigint generated always as identity primary key,
  kind text not null check (kind in ('block', 'pat', 'material')),
  name text not null check (length(name) between 1 and 80),
  data jsonb not null,
  by_user uuid references auth.users(id) on delete set null,
  at timestamptz not null default now(),
  unique (kind, name)
);
alter table public.shared_lib enable row level security;
drop policy if exists shared_lib_read on public.shared_lib;
create policy shared_lib_read on public.shared_lib for select to authenticated using (true);
-- writing only through the functions below

create or replace function public.shared_put(p_kind text, p_name text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not ep_is_admin() then raise exception 'only an administrator can publish to the shared library'; end if;
  if p_kind not in ('block', 'pat', 'material') then raise exception 'unknown kind'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then raise exception 'bad name'; end if;
  if pg_column_size(p_data) > 400000 then raise exception 'too large for the shared library (limit about 400 kB)'; end if;
  insert into shared_lib (kind, name, data, by_user) values (p_kind, trim(p_name), p_data, auth.uid())
    on conflict (kind, name) do update set data = excluded.data, by_user = excluded.by_user, at = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.shared_del(p_kind text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not ep_is_admin() then raise exception 'only an administrator can remove from the shared library'; end if;
  delete from shared_lib where kind = p_kind and name = p_name;
  return jsonb_build_object('ok', true);
end $$;

create table if not exists public.ep_switches (
  key text primary key check (length(key) between 1 and 40),
  off boolean not null default true,
  note text,
  at timestamptz not null default now()
);
alter table public.ep_switches enable row level security;
drop policy if exists ep_switches_read on public.ep_switches;
create policy ep_switches_read on public.ep_switches for select to authenticated using (true);

create or replace function public.admin_set_switch(p_key text, p_off boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'super_admin') then raise exception 'only the super admin can switch modules'; end if;
  if p_key is null or length(trim(p_key)) = 0 or length(p_key) > 40 then raise exception 'bad module name'; end if;
  if p_off then insert into ep_switches (key, off, note) values (trim(p_key), true, p_note) on conflict (key) do update set off = true, note = excluded.note, at = now();
  else delete from ep_switches where key = trim(p_key); end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.shared_put(text, text, jsonb), public.shared_del(text, text), public.admin_set_switch(text, boolean, text), public.ep_is_admin() from public, anon;
grant execute on function public.shared_put(text, text, jsonb), public.shared_del(text, text), public.admin_set_switch(text, boolean, text) to authenticated;
grant select on public.shared_lib, public.ep_switches to authenticated;
