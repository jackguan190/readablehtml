-- ReadableHTML — structured processing layer
-- Adds processing_mode to documents, page_end to document_pages,
-- and raises the alpha AI quota from 0 → 20/month.

alter table public.documents
  add column if not exists processing_mode text
    default 'structured';

-- Use a separate constraint statement so it can be re-run safely.
alter table public.documents
  drop constraint if exists documents_processing_mode_check;
alter table public.documents
  add constraint documents_processing_mode_check
    check (processing_mode in ('extraction_only', 'structured', 'ai_structured'));

alter table public.document_pages
  add column if not exists page_end int;

-- Bump the alpha AI quota. Mirror the change in lib/usage/quota.ts (ALPHA_LIMITS.ai).
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
