-- ReadableHTML — Chandra (layout-aware OCR) integration
-- Adds: chandra_* document statuses, 'chandra' processing_mode value,
-- user_usage.chandra_jobs counter, chandra_job quota kind, chandra_jobs table.
-- The actual Chandra HTTP call is stubbed in lib/documents/chandra-provider.ts;
-- this migration ships the schema surface so the call can be wired in without
-- a coordinated migration + code release.

-- 1. documents.status — add chandra_* lifecycle values alongside existing ocr_*
alter table public.documents
  drop constraint if exists documents_status_check;

alter table public.documents
  add constraint documents_status_check
    check (status in (
      'uploaded',
      'queued',
      'processing',
      'ready',
      'failed',
      'needs_ocr',
      'ocr_queued',
      'ocr_processing',
      'ocr_ready',
      'ocr_failed',
      'chandra_queued',
      'chandra_processing',
      'chandra_ready',
      'chandra_failed'
    ));

-- 2. documents.processing_mode — add 'chandra' so the UI mode pill can show
-- "Chandra layout" distinctly from heuristic/AI structuring.
alter table public.documents
  drop constraint if exists documents_processing_mode_check;

alter table public.documents
  add constraint documents_processing_mode_check
    check (processing_mode in (
      'extraction_only',
      'structured',
      'ai_structured',
      'chandra'
    ));

-- 3. user_usage.chandra_jobs — monthly counter for Chandra invocations.
alter table public.user_usage
  add column if not exists chandra_jobs int not null default 0;

-- 4. consume_quota — recognize chandra_job kind, increment chandra_jobs column.
-- Alpha limit: 5/month per user. Bump this AND lib/usage/quota.ts
-- ALPHA_LIMITS.chandraJobs in lockstep when raising.
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

  if p_kind = 'pdf_upload' then
    v_limit := 10;
  elsif p_kind = 'ai_action' then
    v_limit := 20;
  elsif p_kind = 'ocr_job' then
    v_limit := 0; -- legacy stub kind from migration 0007; superseded by chandra_job
  elsif p_kind = 'chandra_job' then
    v_limit := 5;
  else
    raise exception 'unknown_quota_kind: %', p_kind;
  end if;

  insert into public.user_usage (
    user_id, period_start, pdfs_uploaded, ai_actions, chandra_jobs
  )
  values (
    v_uid,
    v_period,
    case when p_kind = 'pdf_upload' then 1 else 0 end,
    case when p_kind = 'ai_action' then 1 else 0 end,
    case when p_kind = 'chandra_job' then 1 else 0 end
  )
  on conflict (user_id, period_start) do update
  set
    pdfs_uploaded = public.user_usage.pdfs_uploaded
      + (case when p_kind = 'pdf_upload' then 1 else 0 end),
    ai_actions = public.user_usage.ai_actions
      + (case when p_kind = 'ai_action' then 1 else 0 end),
    chandra_jobs = public.user_usage.chandra_jobs
      + (case when p_kind = 'chandra_job' then 1 else 0 end),
    updated_at = now()
  returning case
    when p_kind = 'pdf_upload' then pdfs_uploaded
    when p_kind = 'ai_action' then ai_actions
    when p_kind = 'chandra_job' then chandra_jobs
    else 0
  end
  into v_new_count;

  if v_new_count > v_limit then
    raise exception 'quota_exceeded' using errcode = 'P0001';
  end if;

  return v_new_count;
end;
$$;

-- 5. chandra_jobs — audit + debug trail for each Chandra invocation.
create table if not exists public.chandra_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  page_count int,
  attempts int not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  raw_response jsonb,
  created_at timestamptz not null default now()
);

create index if not exists chandra_jobs_document_id_idx
  on public.chandra_jobs (document_id, created_at desc);

create index if not exists chandra_jobs_user_id_idx
  on public.chandra_jobs (user_id, created_at desc);

alter table public.chandra_jobs enable row level security;

drop policy if exists "chandra_jobs_select_own" on public.chandra_jobs;
create policy "chandra_jobs_select_own" on public.chandra_jobs
  for select using (auth.uid() = user_id);

drop policy if exists "chandra_jobs_insert_own" on public.chandra_jobs;
create policy "chandra_jobs_insert_own" on public.chandra_jobs
  for insert with check (
    auth.uid() = user_id and
    exists (
      select 1 from public.documents d
      where d.id = chandra_jobs.document_id and d.user_id = auth.uid()
    )
  );
