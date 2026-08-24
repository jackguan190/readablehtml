begin;
select plan(15);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
select
  (select id from auth.instances limit 1),
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'authenticated',
  'authenticated',
  'owner-a@example.test',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now();

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

create temp table setup_result (
  assignment_id uuid,
  course_id uuid,
  brief_material_id uuid
) on commit drop;

insert into setup_result
select *
from public.create_assignment_setup(
  null,
  'History 101',
  'Fall 2026',
  'Professor Lee',
  'Essay One',
  '2026-09-30',
  'Write a 1,500-word argument about public memory.'
);

select is(
  (select count(*)::integer from setup_result),
  1,
  'assignment setup returns one row'
);

select is(
  (select c.user_id from public.courses c join setup_result r on r.course_id = c.id),
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'returned course belongs to user A'
);

select ok(
  (
    select a.understanding_status = 'not_started'
      and a.due_on = '2026-09-30'::date
    from public.assignments a
    join setup_result r on r.assignment_id = a.id
  ),
  'returned assignment starts not_started with the requested due date'
);

select is(
  (
    select m.raw_text
    from public.materials m
    join setup_result r on r.brief_material_id = m.id
  ),
  'Write a 1,500-word argument about public memory.',
  'assignment brief preserves the exact passed text'
);

create temp table started_jobs (
  sequence integer generated always as identity,
  job_id uuid not null
) on commit drop;

insert into public.assignment_analysis_jobs (
  user_id, assignment_id, status, attempts, created_at
)
select
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  assignment_id,
  'queued',
  0,
  now() - interval '6 minutes'
from setup_result;

insert into started_jobs (job_id)
select public.start_assignment_analysis(assignment_id)
from setup_result;

select ok(
  (select count(*) = 1 from started_jobs where job_id is not null)
  and (
    select count(*) = 1
    from public.assignment_analysis_jobs j
    join setup_result r on r.assignment_id = j.assignment_id
    where j.status = 'failed'
      and j.started_at is null
      and j.error = 'Analysis timed out. Try again.'
  ),
  'starting analysis recovers an old queued job and returns one new job ID'
);

select ok(
  (
    select j.status = 'running' and j.attempts = 1
    from public.assignment_analysis_jobs j
    join started_jobs s on s.job_id = j.id
    where s.sequence = 1
  ),
  'started job is running on its first attempt'
);

select is(
  (
    select a.understanding_status
    from public.assignments a
    join setup_result r on r.assignment_id = a.id
  ),
  'processing',
  'assignment becomes processing'
);

select throws_ok(
  $invalid_rubric$
    select public.complete_assignment_analysis(
      (select assignment_id from setup_result),
      (select job_id from started_jobs where sequence = 1),
      (select brief_material_id from setup_result),
      '[{"kind":"rubric_criterion","text":"Make a persuasive argument.","reasoningClass":"inference","sourceQuote":null,"sourceStart":null,"sourceEnd":null,"orderIndex":0}]'::jsonb,
      'test-provider',
      'invalid-rubric-model'
    )
  $invalid_rubric$,
  '22023',
  'rubric criteria must be required',
  'an inferred rubric criterion is rejected without consuming the running job'
);

select public.complete_assignment_analysis(
  r.assignment_id,
  s.job_id,
  r.brief_material_id,
  '[{"kind":"constraint","text":"Use at least two primary sources.","reasoningClass":"required","sourceQuote":"public memory","sourceStart":34,"sourceEnd":47,"orderIndex":0},{"kind":"ambiguity","text":"Old AI proposal that the retry must replace.","reasoningClass":"inference","sourceQuote":null,"sourceStart":null,"sourceEnd":null,"orderIndex":1}]'::jsonb,
  'test-provider',
  'test-model'
)
from setup_result r
join started_jobs s on s.sequence = 1;

select ok(
  (
    select j.status = 'succeeded' and a.understanding_status = 'ready'
    from public.assignment_analysis_jobs j
    join started_jobs s on s.job_id = j.id
    join public.assignments a on a.id = j.assignment_id
    where s.sequence = 1
  ),
  'valid completion after rejected rubric marks the job succeeded and assignment ready'
);

select ok(
  (
    select req.origin = 'ai' and req.review_status = 'proposed'
    from public.assignment_requirements req
    join setup_result r on r.assignment_id = req.assignment_id
    where req.text = 'Use at least two primary sources.'
  ),
  'inserted analysis requirement is an AI proposal'
);

update public.assignment_requirements req
set review_status = 'confirmed'
from setup_result r
where req.assignment_id = r.assignment_id
  and req.text = 'Use at least two primary sources.';

insert into started_jobs (job_id)
select public.start_assignment_analysis(assignment_id)
from setup_result;

select throws_ok(
  $invalid_source_slice$
    select public.complete_assignment_analysis(
      (select assignment_id from setup_result),
      (select job_id from started_jobs where sequence = 2),
      (select brief_material_id from setup_result),
      '[{"kind":"constraint","text":"Use the prompt focus.","reasoningClass":"required","sourceQuote":"public memory","sourceStart":0,"sourceEnd":6,"orderIndex":0}]'::jsonb,
      'test-provider',
      'invalid-source-model'
    )
  $invalid_source_slice$,
  '22023',
  'source support must match the assignment brief exactly',
  'a mismatched source slice is rejected before replacing proposals'
);

select ok(
  (
    select j.status = 'running'
      and a.understanding_status = 'processing'
    from public.assignment_analysis_jobs j
    join started_jobs s on s.job_id = j.id and s.sequence = 2
    join public.assignments a on a.id = j.assignment_id
  ),
  'mismatched source support leaves the same job running for a valid retry'
);

select public.complete_assignment_analysis(
  r.assignment_id,
  s.job_id,
  r.brief_material_id,
  '[{"kind":"expectation","text":"Explain why public memory matters.","reasoningClass":"inference","sourceQuote":null,"sourceStart":null,"sourceEnd":null,"orderIndex":0}]'::jsonb,
  'test-provider',
  'test-model-retry'
)
from setup_result r
join started_jobs s on s.sequence = 2;

select is(
  (
    select count(*)::integer
    from public.assignment_requirements req
    join setup_result r on r.assignment_id = req.assignment_id
    where req.text = 'Use at least two primary sources.'
      and req.review_status = 'confirmed'
  ),
  1,
  'retry preserves the confirmed requirement'
);

select results_eq(
  $$
    select req.text, req.review_status
    from public.assignment_requirements req
    join setup_result r on r.assignment_id = req.assignment_id
    where req.review_status = 'proposed'
    order by req.order_index
  $$,
  $$ values ('Explain why public memory matters.'::text, 'proposed'::text) $$,
  'retry replaces old proposals with exactly the new proposal'
);

insert into started_jobs (job_id)
select public.start_assignment_analysis(assignment_id)
from setup_result;

select public.fail_assignment_analysis(
  r.assignment_id,
  s.job_id,
  repeat('x', 1100)
)
from setup_result r
join started_jobs s on s.sequence = 3;

select ok(
  (
    select j.status = 'failed'
      and a.understanding_status = 'failed'
      and j.error = a.understanding_error
      and char_length(j.error) = 1000
    from public.assignment_analysis_jobs j
    join started_jobs s on s.job_id = j.id and s.sequence = 3
    join public.assignments a on a.id = j.assignment_id
  ),
  'failing analysis leaves job and assignment failed with the same capped error'
);

select * from finish();
rollback;
