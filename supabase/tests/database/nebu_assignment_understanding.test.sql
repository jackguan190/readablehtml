begin;
select plan(13);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
select
  (select id from auth.instances limit 1),
  fixture.id,
  'authenticated',
  'authenticated',
  fixture.email,
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
from (values
  ('00000000-0000-0000-0000-0000000000a1'::uuid, 'owner-a@example.test'),
  ('00000000-0000-0000-0000-0000000000b2'::uuid, 'owner-b@example.test')
) as fixture(id, email);

select has_table('public', 'courses', 'courses exists');
select has_table('public', 'assignments', 'assignments exists');
select has_table('public', 'materials', 'materials exists');
select has_table('public', 'assignment_requirements', 'requirements exists');
select has_table('public', 'assignment_analysis_jobs', 'analysis jobs exists');
select has_index(
  'public',
  'assignment_analysis_jobs',
  'one_active_assignment_analysis_idx',
  'only one active analysis job is allowed per assignment'
);
select ok((select relrowsecurity from pg_class where oid = 'public.courses'::regclass), 'courses RLS is active');
select ok((select relrowsecurity from pg_class where oid = 'public.assignments'::regclass), 'assignments RLS is active');
select ok((select relrowsecurity from pg_class where oid = 'public.materials'::regclass), 'materials RLS is active');
select ok((select relrowsecurity from pg_class where oid = 'public.assignment_requirements'::regclass), 'requirements RLS is active');
select ok((select relrowsecurity from pg_class where oid = 'public.assignment_analysis_jobs'::regclass), 'jobs RLS is active');

insert into public.courses (id, user_id, name)
values (
  '10000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000a1',
  'History 101'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);

select is(
  (select count(*)::integer from public.courses),
  0,
  'user B cannot read user A rows'
);

select throws_ok(
  $$
    insert into public.assignments (user_id, course_id, title)
    values (
      '00000000-0000-0000-0000-0000000000b2',
      '10000000-0000-0000-0000-0000000000a1',
      'Unauthorized child'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "assignments"',
  'user B cannot insert an assignment under user A course'
);

select * from finish();
rollback;
