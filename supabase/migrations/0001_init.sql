-- ReadableHTML — initial schema
-- profiles, documents, document_pages, annotations, processing_jobs

create extension if not exists "pgcrypto";

-- profiles: one row per auth.users user
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);

-- documents: uploaded user PDFs (alpha — mock processing)
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  storage_path text not null,
  file_size_bytes bigint,
  page_count int,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'queued', 'processing', 'ready', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_user_id_created_idx
  on public.documents (user_id, created_at desc);

-- document_pages: synthetic sections produced by mock processing
create table if not exists public.document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  section_index int not null,
  section_key text not null,
  title text not null,
  page_start int,
  summary text,
  body jsonb not null,
  key_terms jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, section_key)
);

create index if not exists document_pages_document_id_idx
  on public.document_pages (document_id, section_index);

-- annotations: highlights, notes, quotes, glossary saves, AI explanations
create table if not exists public.annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  section_key text not null,
  kind text not null
    check (kind in ('highlight', 'note', 'quote', 'glossary', 'ai')),
  text text not null,
  inline_id text,
  page int,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists annotations_document_user_idx
  on public.annotations (document_id, user_id, created_at desc);

-- processing_jobs: tracks mock processing runs per document
create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  attempts int not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists processing_jobs_document_id_idx
  on public.processing_jobs (document_id, created_at desc);

-- auto-create profile row on auth signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- touch updated_at on documents
create or replace function public.touch_documents_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists documents_touch_updated_at on public.documents;
create trigger documents_touch_updated_at
  before update on public.documents
  for each row execute function public.touch_documents_updated_at();
