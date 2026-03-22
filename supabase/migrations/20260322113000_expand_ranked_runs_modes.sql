alter table if exists public.ranked_runs
    drop constraint if exists ranked_runs_mode_check;

alter table if exists public.ranked_runs
    add constraint ranked_runs_mode_check
    check (mode in ('ranked_sprint', 'survival_ladder'));
