-- ReadableHTML — Row Level Security
-- Each user sees only their own profiles/documents/pages/annotations/jobs.

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_pages enable row level security;
alter table public.annotations enable row level security;
alter table public.processing_jobs enable row level security;

-- profiles: user can read/update own row, insert on first signup
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- documents: user owns
drop policy if exists "documents_select_own" on public.documents;
create policy "documents_select_own" on public.documents
  for select using (auth.uid() = user_id);

drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_own" on public.documents
  for insert with check (auth.uid() = user_id);

drop policy if exists "documents_update_own" on public.documents;
create policy "documents_update_own" on public.documents
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "documents_delete_own" on public.documents;
create policy "documents_delete_own" on public.documents
  for delete using (auth.uid() = user_id);

-- document_pages: accessible only if parent document is yours
drop policy if exists "document_pages_select_via_document" on public.document_pages;
create policy "document_pages_select_via_document" on public.document_pages
  for select using (
    exists (
      select 1 from public.documents d
      where d.id = document_pages.document_id and d.user_id = auth.uid()
    )
  );

drop policy if exists "document_pages_insert_via_document" on public.document_pages;
create policy "document_pages_insert_via_document" on public.document_pages
  for insert with check (
    exists (
      select 1 from public.documents d
      where d.id = document_pages.document_id and d.user_id = auth.uid()
    )
  );

drop policy if exists "document_pages_delete_via_document" on public.document_pages;
create policy "document_pages_delete_via_document" on public.document_pages
  for delete using (
    exists (
      select 1 from public.documents d
      where d.id = document_pages.document_id and d.user_id = auth.uid()
    )
  );

-- annotations: user owns and document is theirs
drop policy if exists "annotations_select_own" on public.annotations;
create policy "annotations_select_own" on public.annotations
  for select using (auth.uid() = user_id);

drop policy if exists "annotations_insert_own" on public.annotations;
create policy "annotations_insert_own" on public.annotations
  for insert with check (
    auth.uid() = user_id and
    exists (
      select 1 from public.documents d
      where d.id = annotations.document_id and d.user_id = auth.uid()
    )
  );

drop policy if exists "annotations_delete_own" on public.annotations;
create policy "annotations_delete_own" on public.annotations
  for delete using (auth.uid() = user_id);

-- processing_jobs: read/insert via owned document
drop policy if exists "processing_jobs_select_via_document" on public.processing_jobs;
create policy "processing_jobs_select_via_document" on public.processing_jobs
  for select using (
    exists (
      select 1 from public.documents d
      where d.id = processing_jobs.document_id and d.user_id = auth.uid()
    )
  );

drop policy if exists "processing_jobs_insert_via_document" on public.processing_jobs;
create policy "processing_jobs_insert_via_document" on public.processing_jobs
  for insert with check (
    exists (
      select 1 from public.documents d
      where d.id = processing_jobs.document_id and d.user_id = auth.uid()
    )
  );

drop policy if exists "processing_jobs_update_via_document" on public.processing_jobs;
create policy "processing_jobs_update_via_document" on public.processing_jobs
  for update using (
    exists (
      select 1 from public.documents d
      where d.id = processing_jobs.document_id and d.user_id = auth.uid()
    )
  );
