-- Nebu Phase 1 — assignment setup, understanding analysis, and review state.

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  term text check (term is null or char_length(btrim(term)) between 1 and 80),
  instructor_name text check (instructor_name is null or char_length(btrim(instructor_name)) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  due_on date,
  stage text not null default 'setup'
    check (stage in ('setup','research','planning','writing','complete')),
  understanding_status text not null default 'not_started'
    check (understanding_status in ('not_started','processing','ready','failed')),
  understanding_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete cascade,
  kind text not null check (kind in (
    'assignment_brief','rubric','lecture_notes','lecture_slides',
    'ta_office_hours','previous_work','previous_feedback',
    'course_reading','student_note','other'
  )),
  format text not null check (format in ('text','pdf','docx','pptx')),
  raw_text text,
  storage_path text,
  document_id uuid references public.documents(id) on delete set null,
  status text not null default 'ready'
    check (status in ('uploaded','processing','ready','partial','failed')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (raw_text is not null or storage_path is not null)
);

create table public.assignment_requirements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  kind text not null check (kind in (
    'central_question','deliverable','constraint','word_limit','due_date',
    'rubric_criterion','expectation','ambiguity'
  )),
  text text not null check (char_length(btrim(text)) between 1 and 2000),
  reasoning_class text not null check (reasoning_class in ('required','inference')),
  review_status text not null default 'proposed'
    check (review_status in ('proposed','confirmed','rejected')),
  origin text not null check (origin in ('ai','user')),
  student_edited boolean not null default false,
  source_material_id uuid references public.materials(id) on delete set null,
  source_quote text,
  source_start int,
  source_end int,
  order_index int not null check (order_index >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'rubric_criterion' or reasoning_class = 'required'),
  check (
    reasoning_class <> 'required' or
    (source_material_id is not null and source_quote is not null and source_start >= 0 and source_end > source_start)
  )
);

create table public.assignment_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued','running','succeeded','failed')),
  attempts int not null default 0 check (attempts >= 0),
  provider text,
  model text,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create unique index one_assignment_brief_idx
  on public.materials (assignment_id)
  where kind = 'assignment_brief';
create index courses_user_created_idx on public.courses (user_id, created_at desc);
create index assignments_user_created_idx on public.assignments (user_id, created_at desc);
create index assignments_course_idx on public.assignments (course_id, created_at desc);
create index requirements_assignment_order_idx on public.assignment_requirements (assignment_id, order_index);
create index analysis_jobs_assignment_created_idx on public.assignment_analysis_jobs (assignment_id, created_at desc);
create unique index one_active_assignment_analysis_idx
  on public.assignment_analysis_jobs (assignment_id)
  where status in ('queued', 'running');

create or replace function public.create_assignment_setup(
  p_course_id uuid,
  p_course_name text,
  p_term text,
  p_instructor_name text,
  p_assignment_title text,
  p_due_on date,
  p_brief_text text
)
returns table (
  assignment_id uuid,
  course_id uuid,
  brief_material_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_course_id uuid;
  v_assignment_id uuid;
  v_brief_material_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_assignment_title is null or btrim(p_assignment_title) = '' then
    raise exception 'assignment title required' using errcode = '22023';
  end if;
  if p_brief_text is null or btrim(p_brief_text) = '' then
    raise exception 'assignment brief required' using errcode = '22023';
  end if;
  if char_length(p_brief_text) > 100000 then
    raise exception 'assignment brief too long' using errcode = '22023';
  end if;

  if p_course_id is null then
    if p_course_name is null or btrim(p_course_name) = '' then
      raise exception 'course name required' using errcode = '22023';
    end if;
    insert into public.courses (user_id, name, term, instructor_name)
    values (
      v_user_id,
      btrim(p_course_name),
      nullif(btrim(p_term), ''),
      nullif(btrim(p_instructor_name), '')
    )
    returning id into v_course_id;
  else
    select c.id into v_course_id
    from public.courses as c
    where c.id = p_course_id and c.user_id = v_user_id;
    if v_course_id is null then
      raise exception 'course not found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.assignments (user_id, course_id, title, due_on)
  values (v_user_id, v_course_id, btrim(p_assignment_title), p_due_on)
  returning id into v_assignment_id;

  insert into public.materials (
    user_id, course_id, assignment_id, kind, format, raw_text, status
  )
  values (
    v_user_id, v_course_id, v_assignment_id,
    'assignment_brief', 'text', p_brief_text, 'ready'
  )
  returning id into v_brief_material_id;

  return query select v_assignment_id, v_course_id, v_brief_material_id;
end;
$$;

create or replace function public.start_assignment_analysis(p_assignment_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_assignment_id uuid;
  v_job_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select a.id into v_assignment_id
  from public.assignments as a
  where a.id = p_assignment_id and a.user_id = v_user_id
  for update;

  if v_assignment_id is null then
    raise exception 'assignment not found' using errcode = 'P0002';
  end if;

  update public.assignment_analysis_jobs as j
  set
    status = 'failed',
    finished_at = now(),
    error = 'Analysis timed out. Try again.'
  where j.assignment_id = v_assignment_id
    and j.user_id = v_user_id
    and j.status in ('queued', 'running')
    and coalesce(j.started_at, j.created_at) < now() - interval '5 minutes';

  insert into public.assignment_analysis_jobs (
    user_id, assignment_id, status, attempts, started_at
  )
  values (v_user_id, v_assignment_id, 'running', 1, now())
  returning id into v_job_id;

  update public.assignments
  set understanding_status = 'processing', understanding_error = null
  where id = v_assignment_id and user_id = v_user_id;

  return v_job_id;
end;
$$;

create or replace function public.complete_assignment_analysis(
  p_assignment_id uuid,
  p_job_id uuid,
  p_brief_material_id uuid,
  p_items jsonb,
  p_provider text,
  p_model text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_assignment_id uuid;
  v_job_id uuid;
  v_brief_material_id uuid;
  v_brief_text text;
  v_item_count int;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select a.id into v_assignment_id
  from public.assignments as a
  where a.id = p_assignment_id and a.user_id = v_user_id
  for update;

  if v_assignment_id is null then
    raise exception 'assignment not found' using errcode = 'P0002';
  end if;

  select j.id into v_job_id
  from public.assignment_analysis_jobs as j
  where j.id = p_job_id
    and j.assignment_id = v_assignment_id
    and j.user_id = v_user_id
    and j.status = 'running'
  for update;

  if v_job_id is null then
    raise exception 'running analysis job not found' using errcode = 'P0002';
  end if;

  select m.id, m.raw_text into v_brief_material_id, v_brief_text
  from public.materials as m
  where m.id = p_brief_material_id
    and m.assignment_id = v_assignment_id
    and m.user_id = v_user_id
    and m.kind = 'assignment_brief';

  if v_brief_material_id is null then
    raise exception 'assignment brief not found' using errcode = 'P0002';
  end if;

  if v_brief_text is null then
    raise exception 'assignment brief text not found' using errcode = 'P0002';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'analysis items must be an array' using errcode = '22023';
  end if;

  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 40 then
    raise exception 'analysis items must contain between 1 and 40 records' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(
      kind text,
      "reasoningClass" text
    )
    where item.kind = 'rubric_criterion'
      and item."reasoningClass" is distinct from 'required'
  ) then
    raise exception 'rubric criteria must be required' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(
      "reasoningClass" text,
      "sourceQuote" text,
      "sourceStart" int,
      "sourceEnd" int
    )
    where item."reasoningClass" = 'required'
      and (
        item."sourceQuote" is null
        or item."sourceStart" is null
        or item."sourceEnd" is null
      )
  ) then
    raise exception 'required items need source support' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(
      "reasoningClass" text,
      "sourceQuote" text,
      "sourceStart" int,
      "sourceEnd" int
    )
    where item."reasoningClass" = 'inference'
      and (
        item."sourceQuote" is not null
        or item."sourceStart" is not null
        or item."sourceEnd" is not null
      )
  ) then
    raise exception 'inference items cannot have source support' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(
      "sourceQuote" text,
      "sourceStart" int,
      "sourceEnd" int
    )
    where (
        item."sourceQuote" is not null
        or item."sourceStart" is not null
        or item."sourceEnd" is not null
      )
      and (
        item."sourceQuote" is null
        or item."sourceStart" is null
        or item."sourceEnd" is null
        or item."sourceStart" < 0
        or item."sourceEnd" <= item."sourceStart"
        or item."sourceEnd" > char_length(v_brief_text)
        or substring(v_brief_text from item."sourceStart" + 1 for item."sourceEnd" - item."sourceStart") <> item."sourceQuote"
      )
  ) then
    raise exception 'source support must match the assignment brief exactly' using errcode = '22023';
  end if;

  delete from public.assignment_requirements as requirement
  where requirement.assignment_id = v_assignment_id
    and requirement.user_id = v_user_id
    and requirement.origin = 'ai'
    and requirement.review_status = 'proposed';

  insert into public.assignment_requirements (
    user_id,
    assignment_id,
    kind,
    text,
    reasoning_class,
    review_status,
    origin,
    student_edited,
    source_material_id,
    source_quote,
    source_start,
    source_end,
    order_index
  )
  select
    v_user_id,
    v_assignment_id,
    item.kind,
    item.text,
    item."reasoningClass",
    'proposed',
    'ai',
    false,
    case
      when item."sourceQuote" is not null
        and item."sourceStart" is not null
        and item."sourceEnd" is not null
      then v_brief_material_id
      else null
    end,
    item."sourceQuote",
    item."sourceStart",
    item."sourceEnd",
    item."orderIndex"
  from jsonb_to_recordset(p_items) as item(
    kind text,
    text text,
    "reasoningClass" text,
    "sourceQuote" text,
    "sourceStart" int,
    "sourceEnd" int,
    "orderIndex" int
  );

  update public.assignment_analysis_jobs
  set
    status = 'succeeded',
    provider = p_provider,
    model = p_model,
    finished_at = now(),
    error = null
  where id = v_job_id and user_id = v_user_id;

  update public.assignments
  set understanding_status = 'ready', understanding_error = null
  where id = v_assignment_id and user_id = v_user_id;
end;
$$;

create or replace function public.fail_assignment_analysis(
  p_assignment_id uuid,
  p_job_id uuid,
  p_message text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_assignment_id uuid;
  v_job_id uuid;
  v_error text := left(p_message, 1000);
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select a.id into v_assignment_id
  from public.assignments as a
  where a.id = p_assignment_id and a.user_id = v_user_id
  for update;

  if v_assignment_id is null then
    raise exception 'assignment not found' using errcode = 'P0002';
  end if;

  select j.id into v_job_id
  from public.assignment_analysis_jobs as j
  where j.id = p_job_id
    and j.assignment_id = v_assignment_id
    and j.user_id = v_user_id
    and j.status = 'running'
  for update;

  if v_job_id is null then
    raise exception 'running analysis job not found' using errcode = 'P0002';
  end if;

  update public.assignment_analysis_jobs
  set status = 'failed', finished_at = now(), error = v_error
  where id = v_job_id and user_id = v_user_id;

  update public.assignments
  set understanding_status = 'failed', understanding_error = v_error
  where id = v_assignment_id and user_id = v_user_id;
end;
$$;

revoke all on function public.create_assignment_setup(uuid, text, text, text, text, date, text)
  from public, anon;
grant execute on function public.create_assignment_setup(uuid, text, text, text, text, date, text)
  to authenticated;

revoke all on function public.start_assignment_analysis(uuid)
  from public, anon;
grant execute on function public.start_assignment_analysis(uuid)
  to authenticated;

revoke all on function public.complete_assignment_analysis(uuid, uuid, uuid, jsonb, text, text)
  from public, anon;
grant execute on function public.complete_assignment_analysis(uuid, uuid, uuid, jsonb, text, text)
  to authenticated;

revoke all on function public.fail_assignment_analysis(uuid, uuid, text)
  from public, anon;
grant execute on function public.fail_assignment_analysis(uuid, uuid, text)
  to authenticated;

alter table public.courses enable row level security;
alter table public.assignments enable row level security;
alter table public.materials enable row level security;
alter table public.assignment_requirements enable row level security;
alter table public.assignment_analysis_jobs enable row level security;

create policy courses_select_own on public.courses
for select using (auth.uid() = user_id);

create policy courses_insert_own on public.courses
for insert with check (auth.uid() = user_id);

create policy assignments_select_own on public.assignments
for select using (auth.uid() = user_id);

create policy assignments_insert_own on public.assignments
for insert with check (
  auth.uid() = user_id and exists (
    select 1 from public.courses c
    where c.id = assignments.course_id and c.user_id = auth.uid()
  )
);

create policy assignments_update_own on public.assignments
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id and exists (
    select 1 from public.courses c
    where c.id = assignments.course_id and c.user_id = auth.uid()
  )
);

create policy materials_select_own on public.materials
for select using (auth.uid() = user_id);

create policy materials_insert_own on public.materials
for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.courses c
    where c.id = materials.course_id and c.user_id = auth.uid()
  )
  and (
    assignment_id is null
    or exists (
      select 1 from public.assignments a
      where a.id = materials.assignment_id
        and a.user_id = auth.uid()
        and a.course_id = materials.course_id
    )
  )
);

create policy assignment_requirements_select_own on public.assignment_requirements
for select using (auth.uid() = user_id);

create policy assignment_requirements_insert_own on public.assignment_requirements
for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.assignments a
    where a.id = assignment_requirements.assignment_id and a.user_id = auth.uid()
  )
  and (
    source_material_id is null
    or exists (
      select 1 from public.materials m
      where m.id = assignment_requirements.source_material_id
        and m.user_id = auth.uid()
        and m.assignment_id = assignment_requirements.assignment_id
    )
  )
);

create policy assignment_requirements_update_own on public.assignment_requirements
for update
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.assignments a
    where a.id = assignment_requirements.assignment_id and a.user_id = auth.uid()
  )
  and (
    source_material_id is null
    or exists (
      select 1 from public.materials m
      where m.id = assignment_requirements.source_material_id
        and m.user_id = auth.uid()
        and m.assignment_id = assignment_requirements.assignment_id
    )
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.assignments a
    where a.id = assignment_requirements.assignment_id and a.user_id = auth.uid()
  )
  and (
    source_material_id is null
    or exists (
      select 1 from public.materials m
      where m.id = assignment_requirements.source_material_id
        and m.user_id = auth.uid()
        and m.assignment_id = assignment_requirements.assignment_id
    )
  )
);

create policy assignment_requirements_delete_own on public.assignment_requirements
for delete using (
  auth.uid() = user_id
  and exists (
    select 1 from public.assignments a
    where a.id = assignment_requirements.assignment_id and a.user_id = auth.uid()
  )
);

create policy assignment_analysis_jobs_select_own on public.assignment_analysis_jobs
for select using (auth.uid() = user_id);

create policy assignment_analysis_jobs_insert_own on public.assignment_analysis_jobs
for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.assignments a
    where a.id = assignment_analysis_jobs.assignment_id and a.user_id = auth.uid()
  )
);

create policy assignment_analysis_jobs_update_own on public.assignment_analysis_jobs
for update
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.assignments a
    where a.id = assignment_analysis_jobs.assignment_id and a.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.assignments a
    where a.id = assignment_analysis_jobs.assignment_id and a.user_id = auth.uid()
  )
);

grant select, insert on public.courses to authenticated;
grant select, insert, update on public.assignments to authenticated;
grant select, insert on public.materials to authenticated;
grant select, insert, update, delete on public.assignment_requirements to authenticated;
grant select, insert, update on public.assignment_analysis_jobs to authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger courses_touch_updated_at
  before update on public.courses
  for each row execute function public.touch_updated_at();

create trigger assignments_touch_updated_at
  before update on public.assignments
  for each row execute function public.touch_updated_at();

create trigger materials_touch_updated_at
  before update on public.materials
  for each row execute function public.touch_updated_at();

create trigger assignment_requirements_touch_updated_at
  before update on public.assignment_requirements
  for each row execute function public.touch_updated_at();
