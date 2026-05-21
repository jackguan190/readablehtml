-- ReadableHTML — usage limits foundation (alpha)
-- Per-user monthly counters for PDF uploads and AI actions.
-- Counters are written only via the security-definer consume_quota() RPC
-- so users cannot decrement or reset their own limits.

create table if not exists public.user_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  pdfs_uploaded int not null default 0,
  ai_actions int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period_start)
);

create index if not exists user_usage_user_period_idx
  on public.user_usage (user_id, period_start desc);

alter table public.user_usage enable row level security;

-- users can read their own usage rows (so the dashboard can display them)
drop policy if exists "user_usage_select_own" on public.user_usage;
create policy "user_usage_select_own" on public.user_usage
  for select using (auth.uid() = user_id);

-- intentionally no insert/update/delete policies — all writes go through
-- the consume_quota() function below, which runs as security definer.

-- Atomic check-and-increment for a quota kind.
-- Increments inside an insert/on conflict, then raises if the new value exceeds
-- the alpha limit. The raise rolls back the increment inside the same statement,
-- so users cannot accidentally consume a slot when they were already at the cap.
create or replace function public.consume_quota(p_kind text)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_period date := date_trunc('month', timezone('utc', now()))::date;
  v_limit int;
  v_new_count int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Alpha plan limits. Update here (and ALPHA_LIMITS in lib/usage/quota.ts)
  -- when introducing paid plans.
  if p_kind = 'pdf_upload' then
    v_limit := 10;
  elsif p_kind = 'ai_action' then
    v_limit := 0;
  else
    raise exception 'unknown_quota_kind: %', p_kind;
  end if;

  insert into public.user_usage (user_id, period_start, pdfs_uploaded, ai_actions)
  values (
    v_uid,
    v_period,
    case when p_kind = 'pdf_upload' then 1 else 0 end,
    case when p_kind = 'ai_action' then 1 else 0 end
  )
  on conflict (user_id, period_start) do update
  set
    pdfs_uploaded = public.user_usage.pdfs_uploaded
      + case when p_kind = 'pdf_upload' then 1 else 0 end,
    ai_actions = public.user_usage.ai_actions
      + case when p_kind = 'ai_action' then 1 else 0 end,
    updated_at = now()
  returning case when p_kind = 'pdf_upload' then pdfs_uploaded else ai_actions end
  into v_new_count;

  if v_new_count > v_limit then
    raise exception 'quota_exceeded' using errcode = 'P0001';
  end if;

  return v_new_count;
end;
$$;

grant execute on function public.consume_quota(text) to authenticated;
