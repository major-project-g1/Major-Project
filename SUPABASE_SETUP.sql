-- Run this entire script in Supabase Dashboard -> SQL Editor.
-- Supabase Auth stores passwords securely. Do not create a password column
-- and do not SHA-hash passwords in the browser.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  organisation text,
  role text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  scans integer not null default 0 check (scans >= 0),
  threats integer not null default 0 check (threats >= 0),
  warns integer not null default 0 check (warns >= 0),
  safe integer not null default 0 check (safe >= 0),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_stats enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can view their own stats" on public.user_stats;
create policy "Users can view their own stats"
  on public.user_stats for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own stats" on public.user_stats;
create policy "Users can create their own stats"
  on public.user_stats for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own stats" on public.user_stats;
create policy "Users can update their own stats"
  on public.user_stats for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, organisation, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'organisation', ''),
    coalesce(new.raw_user_meta_data ->> 'role', '')
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    phone = excluded.phone,
    organisation = excluded.organisation,
    role = excluded.role,
    updated_at = now();

  insert into public.user_stats (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
