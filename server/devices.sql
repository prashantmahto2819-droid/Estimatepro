-- Estimate Pro — devices per licence (run once in Supabase → SQL editor; safe to run again).
-- Every user may use the app on `profiles.device_limit` devices (default 1). A new device can take the place
-- of the oldest one at most 3 times in 24 hours. The super admin sets the limit per user in the Users tab.

alter table public.profiles add column if not exists device_limit integer not null default 1;

create table if not exists public.user_devices (
  user_id   uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  label     text,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  primary key (user_id, device_id)
);
create table if not exists public.user_device_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now(),
  device_id text, label text, kind text not null
);
create index if not exists user_device_log_user_at on public.user_device_log (user_id, at desc);
-- no policies on purpose: the tables are reached only through the functions below
alter table public.user_devices enable row level security;
alter table public.user_device_log enable row level security;

create or replace function public.ep_dev_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('super_admin', 'admin'));
$$;

create or replace function public.ep_dev_list(p_uid uuid, p_dev text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', device_id, 'label', label, 'first_seen', first_seen, 'last_seen', last_seen, 'me', device_id = p_dev) order by last_seen desc), '[]'::jsonb)
  from user_devices where user_id = p_uid;
$$;

-- called by the app when it opens and every few minutes
create or replace function public.device_check(p_dev text, p_label text default null, p_take boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); lim int; rl text; n int; had boolean; takes int; lbl text := nullif(left(coalesce(p_label, ''), 80), '');
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'signed_out'); end if;
  if p_dev is null or length(p_dev) < 8 or length(p_dev) > 80 then raise exception 'bad device id'; end if;
  select greatest(coalesce(device_limit, 1), 1), role into lim, rl from profiles where id = uid;
  if lim is null then lim := 1; end if;
  if rl = 'super_admin' then lim := greatest(lim, 10); end if;
  update user_devices set last_seen = now(), label = coalesce(lbl, label) where user_id = uid and device_id = p_dev;
  had := found;
  if not had then
    select count(*) into n from user_devices where user_id = uid;
    if n < lim then
      insert into user_devices (user_id, device_id, label) values (uid, p_dev, lbl);
      insert into user_device_log (user_id, device_id, label, kind) values (uid, p_dev, lbl, 'add');
    elsif p_take then
      select count(*) into takes from user_device_log where user_id = uid and kind = 'takeover' and at > now() - interval '24 hours';
      if takes >= 3 and rl is distinct from 'super_admin' then
        return jsonb_build_object('ok', false, 'reason', 'too_many', 'limit', lim, 'devices', ep_dev_list(uid, p_dev));
      end if;
      delete from user_devices d using (select device_id from user_devices where user_id = uid order by last_seen asc limit (n - lim + 1)) o
        where d.user_id = uid and d.device_id = o.device_id;
      insert into user_devices (user_id, device_id, label) values (uid, p_dev, lbl);
      insert into user_device_log (user_id, device_id, label, kind) values (uid, p_dev, lbl, 'takeover');
    else
      return jsonb_build_object('ok', false, 'reason', 'limit', 'limit', lim, 'devices', ep_dev_list(uid, p_dev));
    end if;
  end if;
  return jsonb_build_object('ok', true, 'limit', lim, 'devices', ep_dev_list(uid, p_dev));
end $$;

-- a user removes one of their own devices (for example a phone they no longer use)
create or replace function public.device_remove(p_dev text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from user_devices where user_id = auth.uid() and device_id = p_dev;
  insert into user_device_log (user_id, device_id, kind) values (auth.uid(), p_dev, 'remove');
  return jsonb_build_object('ok', true);
end $$;

-- super admin: limits and device counts of all users
create or replace function public.admin_device_limits() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not ep_dev_admin() then raise exception 'not allowed'; end if;
  return (select coalesce(jsonb_object_agg(p.id, jsonb_build_object('limit', coalesce(p.device_limit, 1), 'n', (select count(*) from user_devices d where d.user_id = p.id))), '{}'::jsonb) from profiles p);
end $$;

create or replace function public.admin_set_device_limit(p_uid uuid, p_n integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not ep_dev_admin() then raise exception 'not allowed'; end if;
  if p_n is null or p_n < 1 or p_n > 50 then raise exception 'limit must be 1 to 50'; end if;
  update profiles set device_limit = p_n where id = p_uid;
  -- when the limit is lowered, the devices used longest ago are dropped
  select count(*) into n from user_devices where user_id = p_uid;
  if n > p_n then
    delete from user_devices d using (select device_id from user_devices where user_id = p_uid order by last_seen asc limit (n - p_n)) o
      where d.user_id = p_uid and d.device_id = o.device_id;
  end if;
  insert into user_device_log (user_id, kind, label) values (p_uid, 'limit', p_n::text);
  return jsonb_build_object('ok', true, 'limit', p_n);
end $$;

create or replace function public.admin_devices(p_uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not ep_dev_admin() then raise exception 'not allowed'; end if;
  return jsonb_build_object('devices', ep_dev_list(p_uid, ''),
    'log', (select coalesce(jsonb_agg(jsonb_build_object('at', at, 'kind', kind, 'label', label) order by at desc), '[]'::jsonb) from (select * from user_device_log where user_id = p_uid order by at desc limit 30) l));
end $$;

create or replace function public.admin_device_remove(p_uid uuid, p_dev text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not ep_dev_admin() then raise exception 'not allowed'; end if;
  delete from user_devices where user_id = p_uid and device_id = p_dev;
  insert into user_device_log (user_id, device_id, kind) values (p_uid, p_dev, 'admin_remove');
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.device_check(text, text, boolean), public.device_remove(text), public.admin_device_limits(), public.admin_set_device_limit(uuid, integer), public.admin_devices(uuid), public.admin_device_remove(uuid, text), public.ep_dev_list(uuid, text), public.ep_dev_admin() from public, anon;
grant execute on function public.device_check(text, text, boolean), public.device_remove(text), public.admin_device_limits(), public.admin_set_device_limit(uuid, integer), public.admin_devices(uuid), public.admin_device_remove(uuid, text) to authenticated;
