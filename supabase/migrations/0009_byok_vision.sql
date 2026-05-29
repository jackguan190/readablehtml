-- ReadableHTML — BYOK Vision/OCR beta
-- Adds vision_* document statuses and 'byok_vision' processing_mode value.
-- No new tables. State tracked entirely on the documents row, matching the
-- 'lightweight v1' decision in the design spec (no vision_jobs audit table
-- for the alpha — reconsider when observability is needed).

-- 1. documents.status — add vision_* lifecycle values.
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
      'chandra_failed',
      'vision_queued',
      'vision_processing',
      'vision_ready',
      'vision_failed'
    ));

-- 2. documents.processing_mode — add 'byok_vision' so the UI mode pill can
--    show "BYOK Vision (beta)" distinctly from Chandra and AI structuring.
alter table public.documents
  drop constraint if exists documents_processing_mode_check;

alter table public.documents
  add constraint documents_processing_mode_check
    check (processing_mode in (
      'extraction_only',
      'structured',
      'ai_structured',
      'chandra',
      'byok_vision'
    ));
