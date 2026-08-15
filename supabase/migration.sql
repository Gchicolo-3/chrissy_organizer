create extension if not exists "pgcrypto";

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  task_text text not null,
  raw_transcript text,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- 2026-08-15: optional due date, powers the /api/calendar ICS feed.
-- Safe to run on an existing table.
alter table public.tasks add column if not exists due_at timestamptz;

alter table public.tasks enable row level security;

-- no login on this app, so we allow the anon key full access to this one table.
-- keep the project URL and anon key out of anywhere public and this is fine for a
-- personal task list. lock it down later with real auth if it ever needs it.
create policy "allow all access"
  on public.tasks
  for all
  using (true)
  with check (true);
