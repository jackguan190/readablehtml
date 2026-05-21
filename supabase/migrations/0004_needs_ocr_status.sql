-- ReadableHTML — allow documents.status = 'needs_ocr'
-- For PDFs where text extraction returned too little content (scanned/image-only).
-- Real OCR is not yet implemented; these documents fall back to mock content + a UI warning.

alter table public.documents
  drop constraint if exists documents_status_check;

alter table public.documents
  add constraint documents_status_check
  check (status in ('uploaded', 'queued', 'processing', 'ready', 'failed', 'needs_ocr'));
