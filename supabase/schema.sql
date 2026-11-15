-- ════════════════════════════════════════════════════════════════
-- PIPELINE//BREAKER — Supabase schema
-- ════════════════════════════════════════════════════════════════
-- How to run this:
--   1. In your Supabase project dashboard, open the "SQL Editor".
--   2. Create a new query.
--   3. Paste the WHOLE file into it and press "Run".
--
-- What it creates:
--   public.profiles  — one row per user (id = auth.users.id, username).
--   public.progress  — per-user progress (solved flags, hints, streak,
--                       time played, total points). Row level security
--                       means each user only sees their own row.
--   public.scores    — the public leaderboard (everyone can read it,
--                       but users only write their own row).
--
-- RLS = Row Level Security: every table has policies so users can
-- only touch their own rows (except scores, which everyone may read).
-- ════════════════════════════════════════════════════════════════

-- ---------- EXTENSIONS ----------
-- gen_random_uuid() comes from pgcrypto (built in on Supabase).
create extension if not exists pgcrypto;

-- ---------- PROFILES ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 2 and 24),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Profiles are private to their owner; the public leaderboard reads "scores".
create policy "Profiles are readable by their owner"
  on public.profiles for select to authenticated using (auth.uid() = id);

create policy "Users create their own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

create policy "Users update their own profile"
  on public.profiles for update to authenticated using (auth.uid() = id);

-- ---------- PROGRESS ----------
create table if not exists public.progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  solved jsonb not null default '{}'::jsonb,
  hints jsonb not null default '{}'::jsonb,
  egg boolean not null default false,
  study_committed boolean not null default false,
  cheat_unlocked boolean not null default false,
  cats_done jsonb not null default '{}'::jsonb,
  streak int not null default 0,
  time_played int not null default 0,
  total_points int not null default 0,
  intro_done boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Incremental: add the intro flag to existing progress rows (safe to re-run).
alter table public.progress add column if not exists intro_done boolean not null default false;

alter table public.progress enable row level security;

create policy "Progress is private to its owner"
  on public.progress for select to authenticated using (auth.uid() = user_id);

create policy "Users insert their own progress"
  on public.progress for insert to authenticated with check (auth.uid() = user_id);

create policy "Users update their own progress"
  on public.progress for update to authenticated using (auth.uid() = user_id);

-- ---------- SCORES (public leaderboard) ----------
create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  username text not null,
  points int not null default 0,
  solved_count int not null default 0,
  rank_name text not null default 'Script Kiddie',
  updated_at timestamptz not null default now()
);

alter table public.scores enable row level security;

-- Anyone (including anonymous) can read the leaderboard.
create policy "Scores are public"
  on public.scores for select using (true);

create policy "Users insert their own score"
  on public.scores for insert to authenticated with check (auth.uid() = user_id);

create policy "Users update their own score"
  on public.scores for update to authenticated using (auth.uid() = user_id);

-- Index for the leaderboard query (ORDER BY points DESC LIMIT 50).
create index if not exists scores_points_idx on public.scores (points desc);

-- ---------- helper: keep updated_at fresh ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists progress_touch on public.progress;
create trigger progress_touch before update on public.progress
  for each row execute function public.touch_updated_at();

drop trigger if exists scores_touch on public.scores;
create trigger scores_touch before update on public.scores
  for each row execute function public.touch_updated_at();
