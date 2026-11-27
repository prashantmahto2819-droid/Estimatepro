-- Estimate Pro — consent record (DPDP Act 2023). Run once in Supabase → SQL editor; safe to run again.
-- The app (js/ui-consent.js) already refuses to send a sign-up / OTP request until the person ticks the two
-- required boxes, and keeps the choice in the account (user_metadata: consent_ver, consent_at, wa_optin).
-- This file adds a permanent log and copies the choice onto the profile:
--   1) consent_log: one row per agreement (who, which policy version, WhatsApp choice, when, browser).
--   2) a trigger on new accounts: the consent sent with the sign-up is logged at once, and an account made
--      without it is marked so the app asks at first sign-in.
--   3) record_consent(): called by the app after sign-in; logs the agreement and sets profiles.wa_optout.
--   4) consent columns on profiles, so the admin can see who agreed (and the WhatsApp queue can skip the rest).

create table if not exists public.consent_log (
  id       bigint generated always as identity primary key,
  user_id  uuid not null references auth.users(id) on delete cascade,
  ver      text not null check (length(ver) between 1 and 40),
  wa_optin boolean not null default false,
  source   text not null default 'app' check (source in ('signup', 'app')),
  ua       text check (ua is null or length(ua) <= 300),
  at       timestamptz not null default now()
);
create index if not exists consent_log_user on public.consent_log (user_id, at desc);
alter table public.consent_log enable row level security;
drop policy if exists consent_log_own on public.consent_log;
create policy consent_log_own on public.consent_log for select using (user_id = auth.uid() or public.ep_is_admin());
-- no insert / update / delete policies: rows are written only by the functions below, and never changed.

alter table public.profiles add column if not exists consent_ver text;
alter table public.profiles add column if not exists consent_at timestamptz;
alter table public.profiles add column if not exists wa_optout boolean not null default false;

-- after sign-in: the signed-in user records their own agreement
create or replace function public.record_consent(ver_ text, wa_ boolean, ua_ text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if ver_ is null or length(ver_) not between 1 and 40 then raise exception 'bad version'; end if;
  insert into consent_log (user_id, ver, wa_optin, source, ua) values (auth.uid(), ver_, coalesce(wa_, false), 'app', left(ua_, 300));
  update profiles set consent_ver = ver_, consent_at = now(), wa_optout = not coalesce(wa_, false) where id = auth.uid();
end $$;
revoke all on function public.record_consent(text, boolean, text) from public, anon;
grant execute on function public.record_consent(text, boolean, text) to authenticated;

-- new account: log the consent that came with the sign-up (user_metadata), if any
create or replace function public.ep_consent_on_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare v text := new.raw_user_meta_data ->> 'consent_ver'; w boolean := coalesce((new.raw_user_meta_data ->> 'wa_optin')::boolean, false);
begin
  if v is not null and length(v) between 1 and 40 then
    insert into consent_log (user_id, ver, wa_optin, source) values (new.id, v, w, 'signup');
  end if;
  return new;
end $$;
drop trigger if exists ep_consent_on_signup on auth.users;
create trigger ep_consent_on_signup after insert on auth.users for each row execute function public.ep_consent_on_signup();

-- profile rows are made by the existing new-user trigger; copy the sign-up consent onto them once they exist
create or replace function public.ep_consent_to_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb;
begin
  select raw_user_meta_data into m from auth.users where id = new.id;
  if m ? 'consent_ver' then
    new.consent_ver := m ->> 'consent_ver';
    new.consent_at := coalesce((m ->> 'consent_at')::timestamptz, now());
    new.wa_optout := not coalesce((m ->> 'wa_optin')::boolean, false);
  else
    new.wa_optout := true;   -- no consent yet: no WhatsApp notifications until the person agrees
  end if;
  return new;
end $$;
drop trigger if exists ep_consent_to_profile on public.profiles;
create trigger ep_consent_to_profile before insert on public.profiles for each row execute function public.ep_consent_to_profile();

-- existing accounts that have not agreed yet: no WhatsApp update notifications until they sign in and agree
-- (they are asked once at their next sign-in; ticking the optional WhatsApp box turns notifications back on)
update public.profiles set wa_optout = true where consent_ver is null and wa_optout = false;
