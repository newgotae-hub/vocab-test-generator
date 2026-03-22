create extension if not exists pgcrypto;

create table if not exists public.ranked_runs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    display_name text not null,
    book_key text not null,
    mode text not null default 'ranked_sprint',
    score integer not null,
    accuracy numeric(5, 2) not null,
    streak integer not null,
    duration_ms integer not null,
    created_at timestamptz not null default timezone('utc', now()),
    constraint ranked_runs_book_key_check check (book_key in ('basic', 'advanced', 'etymology')),
    constraint ranked_runs_mode_check check (mode = 'ranked_sprint'),
    constraint ranked_runs_display_name_length check (char_length(display_name) between 1 and 40),
    constraint ranked_runs_score_check check (score >= 0),
    constraint ranked_runs_accuracy_check check (accuracy >= 0 and accuracy <= 100),
    constraint ranked_runs_streak_check check (streak >= 0),
    constraint ranked_runs_duration_check check (duration_ms >= 0)
);

create index if not exists ranked_runs_mode_book_created_at_idx
    on public.ranked_runs (mode, book_key, created_at desc);

create index if not exists ranked_runs_mode_book_score_idx
    on public.ranked_runs (mode, book_key, score desc, accuracy desc, streak desc, duration_ms asc);

create index if not exists ranked_runs_user_created_at_idx
    on public.ranked_runs (user_id, created_at desc);

alter table public.ranked_runs enable row level security;

grant select on public.ranked_runs to anon, authenticated;
grant insert on public.ranked_runs to authenticated;

drop policy if exists "ranked runs are readable by everyone" on public.ranked_runs;
create policy "ranked runs are readable by everyone"
on public.ranked_runs
for select
to anon, authenticated
using (true);

drop policy if exists "users can insert their own ranked runs" on public.ranked_runs;
create policy "users can insert their own ranked runs"
on public.ranked_runs
for insert
to authenticated
with check (auth.uid() = user_id);
