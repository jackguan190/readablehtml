-- ReadableHTML — OCR architecture stub
-- Adds OCR status values, an ocr_jobs table, and an `ocr_job` quota kind.
-- This is SCAFFOLDING only — real OCR (Chandra) is not implemented yet.
-- consume_quota('ocr_job') always returns quota_exceeded in the alpha
-- (limit 0), so the stub `runOcrForDocument` action cannot accidentally
-- run an unimplemented pipeline.

-- 1. Extend the documents.status check constraint with OCR lifecycle states.
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
      'ocr_failed'
    ));

-- 2. Extend consume_quota with an `ocr_job` kind. Limit is 0 in the alpha so
--    the stub cannot fire; bump this when Chandra (or any real OCR provider)
--    ships, and mirror the new value in lib/usage/quota.ts ALPHA_LIMITS.
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
    v_limit := 0; -- alpha: OCR is not yet implemented
  else
    raise exception 'unknown_quota_kind: %', p_kind;
  end if;

  insert into public.user_usage (
    user_id, period_start, pdfs_uploaded, ai_actions
  )
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
  returning case
    when p_kind = 'pdf_upload' then pdfs_uploaded
    when p_kind = 'ai_action' then ai_actions
    else 0  -- ocr_job has no counter column yet — see notes below
  end
  into v_new_count;

  if v_new_count > v_limit then
    raise exception 'quota_exceeded' using errcode = 'P0001';
  end if;

  return v_new_count;
end;
$$;

-- 3. ocr_jobs table — clean home for OCR job lifecycle (not commingled with
--    structuring's processing_jobs). RLS allows owners to read/insert their
--    own jobs; updates are done server-side by the OCR worker.
create table if not exists public.ocr_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  provider text,            -- 'chandra' | 'tesseract' | etc. — null until set
  page_count int,           -- target pages
  pages_done int not null default 0,
  attempts int not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists ocr_jobs_document_id_idx
  on public.ocr_jobs (document_id, created_at desc);

create index if not exists ocr_jobs_user_id_idx
  on public.ocr_jobs (user_id, created_at desc);

alter table public.ocr_jobs enable row level security;

drop policy if exists "ocr_jobs_select_own" on public.ocr_jobs;
create policy "ocr_jobs_select_own" on public.ocr_jobs
  for select using (auth.uid() = user_id);

drop policy if exists "ocr_jobs_insert_own" on public.ocr_jobs;
create policy "ocr_jobs_insert_own" on public.ocr_jobs
  for insert with check (
    auth.uid() = user_id and
    exists (
      select 1 from public.documents d
      where d.id = ocr_jobs.document_id and d.user_id = auth.uid()
    )
  );

-- Notes for the future:
-- * When OCR is implemented, add a `user_usage.ocr_jobs int` column
--   (or a separate counter table) and wire `consume_quota('ocr_job')`
--   to increment + check against ALPHA_LIMITS.ocrJobs.
-- * The MAX_OCR_PAGES_PER_DOC limit is enforced at the action layer
--   (lib/documents/ocr.ts), not in SQL — it depends on the actual PDF
--   page count which is application-level state.
