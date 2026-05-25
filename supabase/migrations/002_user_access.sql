-- Tier definitions (admin-managed)
create table if not exists public.tiers (
  id      text primary key,
  label   text not null,
  modules text[] not null default '{}'
);

insert into public.tiers (id, label, modules) values
  ('free',    'Free',    array['picks']),
  ('basic',   'Basic',   array['picks','signals']),
  ('premium', 'Premium', array['picks','signals','portfolio','journal'])
on conflict (id) do nothing;

-- User profiles (one row per auth user, auto-created on signup)
create table if not exists public.profiles (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  email             text,
  display_name      text,
  subscription_tier text not null default 'free' references public.tiers(id),
  status            text not null default 'pending'
                      check (status in ('pending','approved','rejected')),
  created_at        timestamptz default now()
);

-- Row-level security
alter table public.profiles enable row level security;
alter table public.tiers    enable row level security;

-- Admin (cc@claudiachez.com) has full access to all profiles
create policy "admin_all_profiles" on public.profiles
  for all using (auth.email() = 'cc@claudiachez.com');

-- Each user can read their own profile
create policy "own_profile_read" on public.profiles
  for select using (auth.uid() = user_id);

-- Tiers are publicly readable (subscriber app needs them for access checks)
create policy "tiers_public_read" on public.tiers
  for select using (true);

-- Admin can write tiers
create policy "admin_write_tiers" on public.tiers
  for all using (auth.email() = 'cc@claudiachez.com');

-- Auto-create profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (user_id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
