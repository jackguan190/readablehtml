-- ReadableHTML — private 'documents' storage bucket
-- Object path convention: {user_id}/{document_id}/{filename}

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "documents_storage_select_own" on storage.objects;
create policy "documents_storage_select_own" on storage.objects
  for select using (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "documents_storage_insert_own" on storage.objects;
create policy "documents_storage_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "documents_storage_delete_own" on storage.objects;
create policy "documents_storage_delete_own" on storage.objects
  for delete using (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
