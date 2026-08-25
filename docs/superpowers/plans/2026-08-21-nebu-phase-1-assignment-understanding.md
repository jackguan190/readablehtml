# Nebu Phase 1 Assignment Understanding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Nebu.AI vertical slice in which an authenticated student creates a course and assignment from a pasted brief, receives a source-backed Assignment Understanding, and confirms, edits, or rejects each proposed item.

**Architecture:** Add a versioned Nebu contract beside the existing Document V1 contract, then persist the slice through new Supabase tables protected by RLS. Keep assignment analysis in a server-only service that depends on the existing LLM transport through a narrow interface; server actions orchestrate authentication, jobs, quota, and persistence. New `/assignments` routes provide the minimal English-only UI without rewriting the existing document library.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript 5.5, Zod 4, Supabase Auth/Postgres/RLS, Vitest 4, pgTAP through the Supabase CLI, existing OpenAI-compatible `LlmProvider`.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-21-nebu-ai-v1-design.md`.
- Product and assistant names are `Nebu.AI` and `Nebu`.
- Ship English-only UI; use stable copy constants instead of embedding alternative-language strings.
- The assignment, not a PDF or blank document, is the organizing object.
- A missing rubric never blocks progress and never permits Nebu to invent an assumed rubric.
- AI-proposed requirements remain Proposed until the student confirms them.
- A Required item must carry an exact quote that resolves to the pasted brief; unsupported interpretation is labelled Inference.
- Nebu never writes directly to trusted memory or silently modifies student work.
- Preserve the existing Document V1 contract and document pipeline; do not refactor them in this phase.
- Do not add Redis, a workflow platform, a vector database, an editor, citations, billing, file upload, or Google Docs integration.
- Use the current Postgres-backed job pattern; synchronous execution behind a persisted job is acceptable for this alpha slice.
- Do not stage or commit the pre-existing `package.json`, `package-lock.json`, or `lib/contracts/` changes unless a task explicitly owns them and the baseline review has approved them.
- Each task gets a fresh review gate and its own commit.

## Baseline prerequisite

Before Task 1, review the dirty worktree. The current expected non-Nebu changes are:

```text
M  package-lock.json
M  package.json
?? lib/contracts/document/v1/
```

The existing Document V1 contract is required by later roadmap phases but is not modified by this plan. Either commit it in a separate reviewed baseline commit or leave it unstaged throughout Phase 1. Record the known pre-existing TypeScript `vision_*` status error and `NotesPanel` exhaustive-deps warning before comparing Phase 1 verification output.

## File responsibility map

```text
lib/contracts/nebu/v1/
  shared.ts               opaque IDs, timestamps, enums shared by Nebu contracts
  course.ts               CourseV1 schema and type
  assignment.ts           AssignmentV1 and pasted brief schemas
  requirement.ts          requirement, source-support, and understanding schemas
  analysis.ts             untrusted model-output schema
  index.ts                public contract exports and parse functions
  fixtures.ts             representative valid fixtures
  contract.test.ts        strict-schema and cross-record invariant tests

lib/assignments/
  input.ts                form/action input normalization and validation
  store.ts                Supabase persistence boundary for this slice
  analyzer.ts             prompt, model-output parsing, exact support resolution
  analyzer.test.ts        fake-provider tests
  actions.ts              authenticated server actions and job orchestration
  queries.ts              server-only assignment list/workspace reads
  view-model.ts           pure requirements-screen grouping and labels
  view-model.test.ts      UI-state tests without React test dependencies

app/assignments/
  page.tsx                authenticated assignment list
  new/page.tsx            authenticated create screen and existing-course query
  new/AssignmentCreateForm.tsx
                          client form using createAssignmentAction
  [id]/requirements/page.tsx
                          authenticated Requirements workspace loader
  [id]/requirements/RequirementsClient.tsx
                          analysis trigger, retry, and requirement decisions

components/nebu/
  NebuHeader.tsx          compact Nebu.AI workspace header
  RequirementsWorkspace.tsx
                          three-area requirements presentation
  RequirementCard.tsx     one proposed/confirmed/rejected item

supabase/migrations/0010_nebu_assignment_understanding.sql
                          tables, constraints, RPC, indexes, RLS, timestamps
supabase/tests/database/nebu_assignment_understanding.test.sql
                          structure, ownership, and cross-user RLS tests
supabase/tests/database/nebu_assignment_lifecycle.test.sql
                          atomic setup, analysis retry, and failure-state tests
```

---

### Task 1: Versioned Nebu course, assignment, and requirement contracts

**Files:**
- Create: `lib/contracts/nebu/v1/shared.ts`
- Create: `lib/contracts/nebu/v1/course.ts`
- Create: `lib/contracts/nebu/v1/assignment.ts`
- Create: `lib/contracts/nebu/v1/requirement.ts`
- Create: `lib/contracts/nebu/v1/analysis.ts`
- Create: `lib/contracts/nebu/v1/index.ts`
- Create: `lib/contracts/nebu/v1/fixtures.ts`
- Create: `lib/contracts/nebu/v1/contract.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Zod 4 only.
- Produces: `CourseV1`, `AssignmentV1`, `AssignmentBriefV1`, `AssignmentRequirementV1`, `AssignmentUnderstandingV1`, `AssignmentAnalysisProposalV1`, and `parseAssignmentUnderstandingV1(input)`.

- [ ] **Step 1: Add a focused test script without altering the existing contract script**

Add this script to `package.json`:

```json
"test:nebu": "vitest run lib/contracts/nebu/v1 lib/assignments"
```

If `vitest` is still only present in the uncommitted Phase 1 package change, resolve that baseline ownership before staging this task. Do not create a second Vitest version.

- [ ] **Step 2: Write the failing strict-contract tests**

Create `lib/contracts/nebu/v1/contract.test.ts` with these tests:

```ts
import { describe, expect, it } from "vitest";
import {
  parseAssignmentUnderstandingV1,
  assignmentAnalysisProposalV1Schema,
} from "./index";
import { assignmentUnderstandingFixture } from "./fixtures";

describe("AssignmentUnderstandingV1", () => {
  it("accepts a source-backed required item and an explicit inference", () => {
    expect(parseAssignmentUnderstandingV1(structuredClone(assignmentUnderstandingFixture)).ok)
      .toBe(true);
  });

  it("rejects a Required item without source support", () => {
    const value = structuredClone(assignmentUnderstandingFixture) as any;
    value.items[0].support = null;
    expect(parseAssignmentUnderstandingV1(value).ok).toBe(false);
  });

  it("rejects source offsets that do not select the stored quote", () => {
    const value = structuredClone(assignmentUnderstandingFixture) as any;
    value.items[0].support.start = 0;
    expect(parseAssignmentUnderstandingV1(value).ok).toBe(false);
  });

  it("rejects a source material other than the owning brief", () => {
    const value = structuredClone(assignmentUnderstandingFixture) as any;
    value.items[0].support.materialId = "other-material";
    expect(parseAssignmentUnderstandingV1(value).ok).toBe(false);
  });

  it("rejects unknown model-output keys", () => {
    const result = assignmentAnalysisProposalV1Schema.safeParse({
      schemaVersion: 1,
      items: [],
      assumedRubric: ["argument quality"],
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
npx vitest run lib/contracts/nebu/v1/contract.test.ts
```

Expected: FAIL because `./index` and `./fixtures` do not exist.

- [ ] **Step 4: Implement the shared schemas**

Create `shared.ts`:

```ts
import { z } from "zod";

export const NEBU_SCHEMA_VERSION = 1 as const;
export const opaqueIdSchema = z.string().min(1);
export const timestampSchema = z.iso.datetime({ offset: true });
export const assignmentStageSchema = z.enum([
  "setup",
  "research",
  "planning",
  "writing",
  "complete",
]);
export const understandingStatusSchema = z.enum([
  "not_started",
  "processing",
  "ready",
  "failed",
]);
```

Create strict `CourseV1` and `AssignmentV1` schemas. Use camelCase at the contract boundary and keep database snake_case inside the store mapper.

```ts
// course.ts
export const courseV1Schema = z.strictObject({
  schemaVersion: z.literal(NEBU_SCHEMA_VERSION),
  id: opaqueIdSchema,
  userId: opaqueIdSchema,
  name: z.string().trim().min(1).max(160),
  term: z.string().trim().min(1).max(80).nullable(),
  instructorName: z.string().trim().min(1).max(160).nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
```

```ts
// assignment.ts
export const assignmentV1Schema = z.strictObject({
  schemaVersion: z.literal(NEBU_SCHEMA_VERSION),
  id: opaqueIdSchema,
  userId: opaqueIdSchema,
  courseId: opaqueIdSchema,
  title: z.string().trim().min(1).max(240),
  dueOn: z.iso.date().nullable(),
  stage: assignmentStageSchema,
  understandingStatus: understandingStatusSchema,
  understandingError: z.string().nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const assignmentBriefV1Schema = z.strictObject({
  schemaVersion: z.literal(NEBU_SCHEMA_VERSION),
  id: opaqueIdSchema,
  userId: opaqueIdSchema,
  courseId: opaqueIdSchema,
  assignmentId: opaqueIdSchema,
  kind: z.literal("assignment_brief"),
  format: z.literal("text"),
  text: z.string().min(1).max(100_000),
  createdAt: timestampSchema,
});
```

- [ ] **Step 5: Implement requirements and document-level invariants**

Create `requirement.ts` with these enums:

```ts
export const requirementKindSchema = z.enum([
  "central_question",
  "deliverable",
  "constraint",
  "word_limit",
  "due_date",
  "rubric_criterion",
  "expectation",
  "ambiguity",
]);

export const reasoningClassSchema = z.enum(["required", "inference"]);
export const reviewStatusSchema = z.enum(["proposed", "confirmed", "rejected"]);
```

Define source support and the requirement record exactly as follows. Offsets are zero-based, end-exclusive UTF-16 code units so they agree with browser selection APIs.

```ts
export const sourceSupportSchema = z.strictObject({
  materialId: opaqueIdSchema,
  quote: z.string().min(1).max(4_000),
  start: z.number().int().min(0),
  end: z.number().int().positive(),
}).refine((value) => value.end > value.start, {
  message: "support end must be greater than start",
  path: ["end"],
});

export const assignmentRequirementV1Schema = z.strictObject({
  schemaVersion: z.literal(NEBU_SCHEMA_VERSION),
  id: opaqueIdSchema,
  assignmentId: opaqueIdSchema,
  kind: requirementKindSchema,
  text: z.string().trim().min(1).max(2_000),
  reasoningClass: reasoningClassSchema,
  reviewStatus: reviewStatusSchema,
  origin: z.enum(["ai", "user"]),
  studentEdited: z.boolean(),
  support: sourceSupportSchema.nullable(),
  orderIndex: z.number().int().min(0),
});
```

Define `assignmentUnderstandingV1Schema` as:

```ts
export const assignmentUnderstandingV1Schema = z
  .strictObject({
    schemaVersion: z.literal(NEBU_SCHEMA_VERSION),
    assignmentId: opaqueIdSchema,
    brief: assignmentBriefV1Schema,
    rubricAvailable: z.boolean(),
    items: z.array(assignmentRequirementV1Schema).min(1),
  })
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    value.items.forEach((item, index) => {
      if (ids.has(item.id)) {
        ctx.addIssue({ code: "custom", path: ["items", index, "id"], message: "duplicate requirement id" });
      }
      ids.add(item.id);
      if (item.assignmentId !== value.assignmentId) {
        ctx.addIssue({ code: "custom", path: ["items", index, "assignmentId"], message: "requirement belongs to another assignment" });
      }
      if (item.reasoningClass === "required" && item.support === null) {
        ctx.addIssue({ code: "custom", path: ["items", index, "support"], message: "required items need exact source support" });
      }
      if (item.support) {
        const { start, end, quote, materialId } = item.support;
        if (materialId !== value.brief.id || value.brief.text.slice(start, end) !== quote) {
          ctx.addIssue({ code: "custom", path: ["items", index, "support"], message: "support must resolve exactly inside the assignment brief" });
        }
      }
    });
  });
```

- [ ] **Step 6: Implement the untrusted model-output schema**

Create `analysis.ts`:

```ts
export const analysisProposalItemV1Schema = z.strictObject({
  kind: requirementKindSchema,
  text: z.string().trim().min(1).max(2_000),
  reasoningClass: reasoningClassSchema,
  supportQuote: z.string().min(1).max(4_000).nullable(),
});

export const assignmentAnalysisProposalV1Schema = z.strictObject({
  schemaVersion: z.literal(NEBU_SCHEMA_VERSION),
  items: z.array(analysisProposalItemV1Schema).min(1).max(40),
});
```

This schema contains no `assumedRubric`, score, grade prediction, or unsupported professor-preference field.

- [ ] **Step 7: Add parse functions, types, and representative fixtures**

`index.ts` exports schemas and inferred types. `parseAssignmentUnderstandingV1()` returns a discriminated result matching the existing Document V1 style:

```ts
export type ParseAssignmentUnderstandingV1Result =
  | { ok: true; understanding: AssignmentUnderstandingV1 }
  | { ok: false; code: "unsupported_version" | "invalid_understanding"; message: string };
```

Use fixture brief text `Write a 1,500-word argument about public memory.`. Its Required word-limit item uses `{ quote: "1,500-word", start: 8, end: 18 }`; its Inference ambiguity item has `support: null`. This makes the offset-mismatch test deterministic because the valid quote does not begin at index zero.

- [ ] **Step 8: Run tests and type checking**

Run:

```bash
npx vitest run lib/contracts/nebu/v1/contract.test.ts
npx tsc --noEmit --incremental false
```

Expected: Nebu contract tests PASS. TypeScript output contains no new errors compared with the recorded baseline.

- [ ] **Step 9: Commit only the Nebu contract task**

```bash
git add package.json lib/contracts/nebu/v1
git commit -m "feat(nebu): add assignment understanding contract"
```

Do not stage `lib/contracts/document/v1` under this commit unless the baseline review deliberately assigned it here, which is not recommended.

---

### Task 2: Supabase persistence, atomic setup RPC, and RLS tests

**Files:**
- Create: `supabase/migrations/0010_nebu_assignment_understanding.sql`
- Create: `supabase/tests/database/nebu_assignment_understanding.test.sql`
- Create: `supabase/tests/database/nebu_assignment_lifecycle.test.sql`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: Contract enums from Task 1 as duplicated SQL check constraints; any enum change requires contract and migration review together.
- Produces: `courses`, `assignments`, `materials`, `assignment_requirements`, `assignment_analysis_jobs`, and four narrow RPCs: `create_assignment_setup(...)`, `start_assignment_analysis(...)`, `complete_assignment_analysis(...)`, and `fail_assignment_analysis(...)`.

- [ ] **Step 1: Install the local Supabase test CLI and add a script**

Run:

```bash
npm install --save-dev supabase
```

Add:

```json
"test:db": "supabase test db"
```

If `supabase/config.toml` does not exist, run `npx supabase init` once and review the generated configuration before staging it.

- [ ] **Step 2: Write the failing pgTAP test first**

Create `supabase/tests/database/nebu_assignment_understanding.test.sql` with the complete test below. The two fixed users make the ownership boundary reproducible and the assertions use only pgTAP primitives available in the Supabase test database:

```sql
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
```

Create `supabase/tests/database/nebu_assignment_lifecycle.test.sql` as a second transaction with its own `plan(13)`. Authenticate as fixed user A and use temp tables to retain rows returned by RPCs. Assert these exact outcomes in order:

1. `create_assignment_setup(null, 'History 101', 'Fall 2026', 'Professor Lee', 'Essay One', '2026-09-30', 'Write a 1,500-word argument about public memory.')` returns one row;
2. the returned course belongs to user A;
3. the returned assignment has `understanding_status='not_started'` and `due_on='2026-09-30'`;
4. its single brief preserves the exact passed text;
5. `start_assignment_analysis(assignment_id)` returns one job ID;
6. that job is `running` with `attempts=1`;
7. the assignment is `processing`;
8. completing the job with one valid Required JSON record marks the job `succeeded`;
9. the assignment becomes `ready`;
10. the inserted proposal is `origin='ai' and review_status='proposed'`;
11. after confirming that row, starting and completing a retry preserves the confirmed row;
12. that retry replaces the old Proposed row with exactly the new Proposed row;
13. starting a third job and calling `fail_assignment_analysis` leaves both job and assignment in `failed` state with the same capped error.

Use `is(...)`, `ok(...)`, and `results_eq(...)`; do not inspect tables as `postgres` after authentication. The function contracts are `start_assignment_analysis(...) returns uuid`, `complete_assignment_analysis(...) returns void`, and `fail_assignment_analysis(...) returns void`.

- [ ] **Step 3: Run the DB test to verify it fails**

Run:

```bash
npx supabase start
npx supabase db reset
npm run test:db
```

Expected: both database test files FAIL because the five tables and four RPCs do not exist.

- [ ] **Step 4: Create the migration with exact ownership columns and checks**

The migration creates:

```sql
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
```

Add unique/index constraints:

```sql
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
```

- [ ] **Step 5: Add atomic assignment setup RPC**

Add this transaction-scoped `security invoker` function to the migration:

```sql
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

revoke all on function public.create_assignment_setup(uuid, text, text, text, text, date, text)
  from public, anon;
grant execute on function public.create_assignment_setup(uuid, text, text, text, text, date, text)
  to authenticated;
```

Do not make this function `security definer`: RLS remains the final ownership authority and a failed statement rolls back the whole function call.

Add `public.start_assignment_analysis(p_assignment_id uuid)` as a `security invoker` RPC. It verifies and locks the owned assignment, marks any owned active job with `started_at < now() - interval '5 minutes'` as failed with `Analysis timed out. Try again.`, inserts one job directly in `running` state with `attempts=1` and `started_at=now()`, sets the assignment to `understanding_status='processing'`, clears its previous error, and returns the job ID. A non-stale active job still conflicts through the partial unique index; the store maps that to `conflict`. Grant only to `authenticated`.

Add `public.complete_assignment_analysis(p_assignment_id uuid, p_job_id uuid, p_brief_material_id uuid, p_items jsonb, p_provider text, p_model text)` as another `security invoker` RPC. In one transaction it must:

1. require `auth.uid()`;
2. lock and verify the owned assignment and the owned `running` job with `select ... for update`;
3. verify the brief material is the owned `assignment_brief` for that assignment;
4. require `p_items` to be a JSON array containing 1–40 records;
5. delete only rows for this assignment where `origin='ai' and review_status='proposed'`;
6. insert the records through `jsonb_to_recordset`, setting `origin='ai'`, `review_status='proposed'`, `student_edited=false`, and using `p_brief_material_id` only for rows with non-null source support;
7. mark the job `succeeded` with provider, model, and `finished_at=now()`;
8. mark the assignment `understanding_status='ready'` and clear `understanding_error`.

The JSON record shape is fixed to:

```json
{
  "kind": "constraint",
  "text": "Use at least two primary sources.",
  "reasoningClass": "required",
  "sourceQuote": "at least two primary sources",
  "sourceStart": 42,
  "sourceEnd": 70,
  "orderIndex": 0
}
```

Inside the RPC, reject a Required record without all three source fields and reject an Inference record with any source field. Contract parsing and the store boundary validate the UTF-16 source slice before calling the RPC; database constraints revalidate shape and ownership. Revoke execution from `public` and `anon`, grant only to `authenticated`, and do not expose a general-purpose bulk insert RPC.

Add `public.fail_assignment_analysis(p_assignment_id uuid, p_job_id uuid, p_message text)` as a small `security invoker` RPC. It locks and verifies the owned assignment/job, marks the job `failed` with a capped 1,000-character error and `finished_at=now()`, and marks the assignment `understanding_status='failed'` with the same error. Grant it only to `authenticated`. This keeps both status rows consistent without giving the client direct table mutation authority.

- [ ] **Step 6: Add RLS policies for every table**

Enable RLS on all five tables. Create only the policies in this matrix; do not use a broad `for all` policy.

| Table | Operation | `using` / `with check` rule |
|---|---|---|
| `courses` | select | `auth.uid() = user_id` |
| `courses` | insert | `auth.uid() = user_id` |
| `assignments` | select | `auth.uid() = user_id` |
| `assignments` | insert | own row and referenced course is owned |
| `assignments` | update | own row; updated row still points to an owned course |
| `materials` | select | `auth.uid() = user_id` |
| `materials` | insert | own row, owned course, and optional assignment is owned and belongs to that course |
| `assignment_requirements` | select | `auth.uid() = user_id` |
| `assignment_requirements` | insert | own row, owned assignment, and optional source material belongs to the same assignment |
| `assignment_requirements` | update | same ownership checks in both `using` and `with check` |
| `assignment_requirements` | delete | own row whose assignment is owned |
| `assignment_analysis_jobs` | select | `auth.uid() = user_id` |
| `assignment_analysis_jobs` | insert | own row whose assignment is owned |
| `assignment_analysis_jobs` | update | same ownership checks in both `using` and `with check` |

The assignment insert policy is:

```sql
create policy assignments_insert_own on public.assignments
for insert with check (
  auth.uid() = user_id and exists (
    select 1 from public.courses c
    where c.id = course_id and c.user_id = auth.uid()
  )
);
```

Use separately named policies such as `courses_select_own` and `assignments_insert_own`. The migration and pgTAP test must prove the child-parent ownership rule; application filters are defense in depth, not a replacement for RLS.

- [ ] **Step 7: Add updated-at triggers**

Use one focused trigger function, `public.touch_updated_at()`, on courses, assignments, materials, and requirements. Do not change the existing document-specific trigger in this migration.

- [ ] **Step 8: Reset and run DB tests**

```bash
npx supabase db reset
npm run test:db
```

Expected: 26 assertions PASS across the ownership and lifecycle files.

- [ ] **Step 9: Commit persistence only**

```bash
git add package.json package-lock.json supabase/config.toml supabase/migrations/0010_nebu_assignment_understanding.sql supabase/tests/database/nebu_assignment_understanding.test.sql supabase/tests/database/nebu_assignment_lifecycle.test.sql
git commit -m "feat(nebu): persist courses and assignment understanding"
```

---

### Task 3: Assignment input validation, store, and queries

**Files:**
- Create: `lib/assignments/input.ts`
- Create: `lib/assignments/input.test.ts`
- Create: `lib/assignments/store.ts`
- Create: `lib/assignments/queries.ts`

**Interfaces:**
- Consumes: Task 1 contract types and Task 2 RPC/tables.
- Produces: `parseCreateAssignmentInput(formData)`, `createAssignmentSetup(supabase, userId, input)`, `getOwnedCourses(supabase, userId)`, `getAssignmentList(supabase, userId)`, and `getAssignmentWorkspace(supabase, userId, assignmentId)`.

- [ ] **Step 1: Write failing input tests**

Create `lib/assignments/input.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseCreateAssignmentInput } from "./input";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

const base = {
  assignmentTitle: "  Essay One  ",
  briefText: "  Analyze the role of memory.  ",
  dueOn: "",
};

describe("parseCreateAssignmentInput", () => {
  it("accepts an existing course", () => {
    expect(parseCreateAssignmentInput(form({
      ...base,
      courseMode: "existing",
      courseId: "course-1",
    }))).toEqual({
      ok: true,
      value: {
        courseMode: "existing",
        courseId: "course-1",
        assignmentTitle: "Essay One",
        briefText: "Analyze the role of memory.",
        dueOn: null,
      },
    });
  });

  it("accepts a new course and normalizes optional labels", () => {
    expect(parseCreateAssignmentInput(form({
      ...base,
      courseMode: "new",
      courseName: "  Modern History  ",
      term: "  Fall 2026  ",
      instructorName: "   ",
      dueOn: "2026-09-30",
    }))).toEqual({
      ok: true,
      value: {
        courseMode: "new",
        courseName: "Modern History",
        term: "Fall 2026",
        instructorName: null,
        assignmentTitle: "Essay One",
        briefText: "Analyze the role of memory.",
        dueOn: "2026-09-30",
      },
    });
  });

  const invalidCases: Array<{
    values: Record<string, string>;
    field: string;
    message: string;
  }> = [
    { values: { ...base, courseMode: "existing", courseId: "", assignmentTitle: "" }, field: "assignmentTitle", message: "Assignment title is required." },
    { values: { ...base, courseMode: "existing", courseId: "", briefText: "   " }, field: "briefText", message: "Assignment brief is required." },
    { values: { ...base, courseMode: "existing", courseId: "", dueOn: "09/30/2026" }, field: "dueOn", message: "Use a valid date in YYYY-MM-DD format." },
    { values: { ...base, courseMode: "existing", courseId: "", briefText: "x".repeat(100_001) }, field: "briefText", message: "Assignment brief must be 100,000 characters or fewer." },
  ];

  it.each(invalidCases)("returns the exact $field error", ({ values, field, message }) => {
    const result = parseCreateAssignmentInput(form(values));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors[field]).toBe(message);
  });
});
```

Use a discriminated result:

```ts
type InputResult<T> =
  | { ok: true; value: T }
  | { ok: false; fieldErrors: Record<string, string> };
```

- [ ] **Step 2: Run and observe failure**

```bash
npx vitest run lib/assignments/input.test.ts
```

Expected: FAIL because `input.ts` does not exist.

- [ ] **Step 3: Implement input normalization**

`CreateAssignmentInput` is a discriminated union:

```ts
type CreateAssignmentInput = {
  assignmentTitle: string;
  briefText: string;
  dueOn: string | null;
} & (
  | { courseMode: "existing"; courseId: string }
  | { courseMode: "new"; courseName: string; term: string | null; instructorName: string | null }
);
```

Trim user-entered labels and brief edges without normalizing internal brief whitespace because source offsets depend on the stored text.

Accept `dueOn` only when it is empty or matches `YYYY-MM-DD` and round-trips through a UTC `Date` without changing year, month, or day. This rejects values such as `2026-02-30`. Use these exact field messages so the tests and UI share one contract:

```ts
export const CREATE_ASSIGNMENT_ERRORS = {
  courseId: "Choose a course.",
  courseName: "Course name is required.",
  assignmentTitle: "Assignment title is required.",
  briefText: "Assignment brief is required.",
  briefTooLong: "Assignment brief must be 100,000 characters or fewer.",
  dueOn: "Use a valid date in YYYY-MM-DD format.",
} as const;
```

- [ ] **Step 4: Implement the store boundary**

`createAssignmentSetup()` calls the RPC and maps database errors into:

```ts
export type StoreResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "not_found" | "not_authorized" | "conflict" | "database"; message: string };
```

Do not expose raw Postgres errors to the UI. Do not accept `user_id` from the browser; the action supplies the authenticated ID, while the RPC uses `auth.uid()` as final authority.

- [ ] **Step 5: Implement assignment list and workspace queries**

`getAssignmentWorkspace()` returns exactly:

```ts
export interface AssignmentWorkspaceData {
  course: CourseV1;
  assignment: AssignmentV1;
  brief: AssignmentBriefV1;
  requirements: AssignmentRequirementV1[];
  latestAnalysisJob: {
    id: string;
    status: "queued" | "running" | "succeeded" | "failed";
    startedAt: string | null;
    error: string | null;
  } | null;
}
```

The query includes `.eq("user_id", userId)` even though RLS also applies. It returns `null` for missing or inaccessible assignments rather than revealing ownership.

- [ ] **Step 6: Run tests and type checking**

```bash
npx vitest run lib/assignments/input.test.ts
npx tsc --noEmit --incremental false
```

Expected: input tests PASS; no new TypeScript errors.

- [ ] **Step 7: Commit the assignment persistence boundary**

```bash
git add lib/assignments/input.ts lib/assignments/input.test.ts lib/assignments/store.ts lib/assignments/queries.ts
git commit -m "feat(nebu): add assignment setup store"
```

---

### Task 4: Source-backed assignment analyzer

**Files:**
- Create: `lib/assignments/analyzer.ts`
- Create: `lib/assignments/analyzer.test.ts`

**Interfaces:**
- Consumes: `AssignmentAnalysisProposalV1`, `AssignmentRequirementV1`, and `Pick<LlmProvider, "callStructured">`.
- Produces: `analyzeAssignmentBrief(input): Promise<AnalyzeBriefResult>` and exported `ASSIGNMENT_ANALYSIS_SYSTEM_PROMPT` for prompt-policy tests.

- [ ] **Step 1: Write fake-provider tests before the prompt**

Create `lib/assignments/analyzer.test.ts` with a fake provider that has only `callStructured`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  analyzeAssignmentBrief,
  ASSIGNMENT_ANALYSIS_SYSTEM_PROMPT,
} from "./analyzer";

function providerReturning(content: string) {
  return {
    callStructured: vi.fn(async () => ({
      content,
      modelUsed: "gpt-test",
      providerUsed: "openai" as const,
    })),
  };
}

function proposal(items: unknown[]): string {
  return JSON.stringify({ schemaVersion: 1, items });
}

describe("analyzeAssignmentBrief", () => {
  it("resolves a unique exact support quote to UTF-16 offsets", async () => {
    const briefText = "Write a 1,500-word argument about public memory.";
    const result = await analyzeAssignmentBrief({
      briefText,
      provider: providerReturning(proposal([{
        kind: "word_limit",
        text: "The essay is 1,500 words.",
        reasoningClass: "required",
        supportQuote: "1,500-word",
      }])),
    });
    expect(result).toMatchObject({
      ok: true,
      items: [{ support: { quote: "1,500-word", start: 8, end: 18 } }],
    });
  });

  it("keeps ambiguity as inference with null support", async () => {
    const result = await analyzeAssignmentBrief({
      briefText: "Discuss memory.",
      provider: providerReturning(proposal([{
        kind: "ambiguity",
        text: "The expected evidence base is unclear.",
        reasoningClass: "inference",
        supportQuote: null,
      }])),
    });
    expect(result).toMatchObject({ ok: true, items: [{ support: null }] });
  });

  it("rejects invalid JSON", async () => {
    const result = await analyzeAssignmentBrief({
      briefText: "Discuss memory.",
      provider: providerReturning("not-json"),
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_model_output" });
  });

  it("rejects unknown output keys", async () => {
    const result = await analyzeAssignmentBrief({
      briefText: "Discuss memory.",
      provider: providerReturning(JSON.stringify({
        schemaVersion: 1,
        items: [{
          kind: "central_question",
          text: "Discuss memory.",
          reasoningClass: "required",
          supportQuote: "Discuss memory.",
        }],
        assumedRubric: ["clarity"],
      })),
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_model_output" });
  });

  it.each([
    ["an absent quote", "Discuss memory.", "Use archival evidence."],
    ["a repeated quote", "Use evidence. Use evidence.", "Use evidence."],
  ])("rejects required support with %s", async (_name, briefText, supportQuote) => {
    const result = await analyzeAssignmentBrief({
      briefText,
      provider: providerReturning(proposal([{
        kind: "constraint",
        text: "Use evidence.",
        reasoningClass: "required",
        supportQuote,
      }])),
    });
    expect(result).toMatchObject({ ok: false, code: "unverifiable_support" });
  });

  it("limits output to forty items", async () => {
    const items = Array.from({ length: 41 }, (_, index) => ({
      kind: "ambiguity",
      text: `Ambiguity ${index}`,
      reasoningClass: "inference",
      supportQuote: null,
    }));
    const result = await analyzeAssignmentBrief({
      briefText: "Discuss memory.",
      provider: providerReturning(proposal(items)),
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_model_output" });
  });

  it("instructs the model not to invent missing context", async () => {
    const provider = providerReturning(proposal([{
      kind: "ambiguity",
      text: "No rubric is included.",
      reasoningClass: "inference",
      supportQuote: null,
    }]));
    await analyzeAssignmentBrief({ briefText: "Discuss memory.", provider });
    expect(ASSIGNMENT_ANALYSIS_SYSTEM_PROMPT).toContain("Do not invent a rubric");
    expect(ASSIGNMENT_ANALYSIS_SYSTEM_PROMPT).toContain("professor preference");
    expect(provider.callStructured.mock.calls[0][0].systemPrompt)
      .toBe(ASSIGNMENT_ANALYSIS_SYSTEM_PROMPT);
  });
});
```

- [ ] **Step 2: Run and observe failure**

```bash
npx vitest run lib/assignments/analyzer.test.ts
```

Expected: FAIL because `analyzer.ts` does not exist.

- [ ] **Step 3: Implement the system prompt as a named constant**

The prompt must contain these rules verbatim in meaning:

```text
Analyze only the supplied assignment brief.
Do not invent a rubric, grading criterion, professor preference, due date, or word limit.
Use reasoningClass "required" only when supportQuote is an exact, unique substring of the brief.
Use reasoningClass "inference" for interpretation or ambiguity and set supportQuote to null.
Return strict JSON matching schemaVersion 1. Do not return prose outside JSON.
```

Request central question, deliverables, constraints, dates, word limit, explicit expectations, criteria present in the brief, and ambiguities.

- [ ] **Step 4: Parse and resolve support fail-closed**

Implement:

```ts
function findUniqueQuote(text: string, quote: string): { start: number; end: number } | null {
  const start = text.indexOf(quote);
  if (start < 0) return null;
  if (text.indexOf(quote, start + 1) >= 0) return null;
  return { start, end: start + quote.length };
}
```

`analyzeAssignmentBrief()`:

1. calls `provider.callStructured({ responseFormat: "json", temperature: 0.1 })`;
2. parses JSON;
3. validates with `assignmentAnalysisProposalV1Schema`;
4. resolves every Required quote uniquely;
5. rejects Required items without valid support;
6. rejects Inference items with a support quote, keeping the trust model simple;
7. returns normalized requirement drafts with stable order but no database IDs.

Return:

```ts
export interface AnalyzeAssignmentBriefInput {
  briefText: string;
  provider: Pick<LlmProvider, "callStructured">;
}

export interface NewRequirementDraft {
  kind: RequirementKind;
  text: string;
  reasoningClass: ReasoningClass;
  support: { quote: string; start: number; end: number } | null;
  orderIndex: number;
}

export type AnalyzeBriefResult =
  | { ok: true; items: NewRequirementDraft[]; providerUsed: string; modelUsed: string }
  | { ok: false; code: "invalid_model_output" | "unverifiable_support" | "provider_error"; message: string };
```

- [ ] **Step 5: Run analyzer and contract tests**

```bash
npx vitest run lib/assignments/analyzer.test.ts lib/contracts/nebu/v1/contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the analyzer**

```bash
git add lib/assignments/analyzer.ts lib/assignments/analyzer.test.ts
git commit -m "feat(nebu): analyze assignment briefs with source support"
```

---

### Task 5: Authenticated actions and persisted analysis job lifecycle

**Files:**
- Create: `lib/assignments/actions.ts`
- Create: `lib/assignments/action-input.ts`
- Create: `lib/assignments/action-input.test.ts`
- Modify: `lib/assignments/store.ts`
- Modify: `lib/assignments/queries.ts`

**Interfaces:**
- Consumes: Tasks 2–4, `buildProvider`, `consumeQuota`, and authenticated Supabase server client.
- Produces: `parseRequirementDecisionInput`, `createAssignmentAction`, `analyzeAssignmentAction`, and `reviewRequirementAction`.

- [ ] **Step 1: Add failing tests for decision input**

Keep the pure parser outside the `"use server"` action module. Create `lib/assignments/action-input.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseRequirementDecisionInput } from "./action-input";

function decision(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return parseRequirementDecisionInput(data);
}

const ids = { assignmentId: "assignment-1", requirementId: "requirement-1" };

describe("parseRequirementDecisionInput", () => {
  it("accepts confirm without edited text", () => {
    expect(decision({ ...ids, decision: "confirm" })).toEqual({
      ok: true,
      value: { ...ids, decision: "confirm" },
    });
  });

  it("requires nonblank text when confirming an edit", () => {
    expect(decision({ ...ids, decision: "edit_and_confirm", editedText: "  " }))
      .toEqual({ ok: false, message: "Edited requirement text is required." });
  });

  it("accepts reject", () => {
    expect(decision({ ...ids, decision: "reject" })).toEqual({
      ok: true,
      value: { ...ids, decision: "reject" },
    });
  });

  it("rejects an unknown decision", () => {
    expect(decision({ ...ids, decision: "approve" }))
      .toEqual({ ok: false, message: "Choose a valid review action." });
  });
});
```

The accepted input is:

```ts
export type RequirementDecisionInput = {
  assignmentId: string;
  requirementId: string;
  decision: "confirm" | "edit_and_confirm" | "reject";
  editedText?: string;
};

export type RequirementDecisionParseResult =
  | { ok: true; value: RequirementDecisionInput }
  | { ok: false; message: string };
```

`parseRequirementDecisionInput()` trims IDs and edited text, rejects blank IDs with `"Assignment or requirement was not found."`, omits `editedText` for `confirm` and `reject`, and returns the exact messages asserted above.

- [ ] **Step 2: Run and observe failure**

```bash
npx vitest run lib/assignments/action-input.test.ts
```

- [ ] **Step 3: Implement `createAssignmentAction`**

The action:

1. requires an authenticated user;
2. parses `FormData` with Task 3;
3. calls `createAssignmentSetup`;
4. returns field errors without redirecting on failure;
5. redirects to `/assignments/{id}/requirements` on success.

Use a form-state return shape:

```ts
export interface CreateAssignmentFormState {
  formError: string | null;
  fieldErrors: Record<string, string>;
}
```

- [ ] **Step 4: Extend the store for job and requirement writes**

Add focused methods:

```ts
startAssignmentAnalysis(userId, assignmentId): Promise<StoreResult<{ id: string }>>;
completeAssignmentAnalysis(userId, assignmentId, jobId, briefId, items, provider, model): Promise<StoreResult<true>>;
failAssignmentAnalysis(userId, assignmentId, jobId, message): Promise<StoreResult<true>>;
reviewRequirement(userId, input): Promise<StoreResult<AssignmentRequirementV1>>;
```

`startAssignmentAnalysis` calls the atomic start RPC and maps its unique-index violation to `conflict`. `completeAssignmentAnalysis` verifies every source slice against the stored brief again, serializes the fixed JSON record shape from Task 2, and calls the atomic completion RPC. That RPC deletes only existing `review_status='proposed'` AI rows and never deletes confirmed, rejected, or user-authored rows. `failAssignmentAnalysis` calls the paired failure RPC so job and assignment statuses cannot diverge.

- [ ] **Step 5: Implement `analyzeAssignmentAction`**

The action:

1. requires user and owned workspace;
2. preflights platform AI quota using the existing usage snapshot;
3. calls `startAssignmentAnalysis`; its unique active-job constraint rejects a concurrent request;
4. builds the existing platform provider;
5. calls `analyzeAssignmentBrief`;
6. consumes one AI action only after valid analysis;
7. calls `completeAssignmentAnalysis`, which atomically replaces only AI Proposed requirements and marks assignment/job Ready/Succeeded;
8. on any post-start failure, calls `failAssignmentAnalysis` and returns a retryable English error;
9. revalidates the requirements route.

Do not persist prompts, API keys, or full provider responses.

- [ ] **Step 6: Implement `reviewRequirementAction`**

Ownership is checked by assignment and requirement ID. Decisions map as follows:

```text
confirm          → review_status=confirmed, student_edited=false
edit_and_confirm → text=trimmed editedText, review_status=confirmed, student_edited=true
reject           → review_status=rejected, text unchanged
```

The action never changes source support when editing the explanatory text. It revalidates the requirements route.

- [ ] **Step 7: Run tests and type checking**

```bash
npx vitest run lib/assignments/action-input.test.ts lib/assignments/analyzer.test.ts
npx tsc --noEmit --incremental false
```

Expected: tests PASS; no new TypeScript errors.

- [ ] **Step 8: Commit the actions**

```bash
git add lib/assignments/actions.ts lib/assignments/action-input.ts lib/assignments/action-input.test.ts lib/assignments/store.ts lib/assignments/queries.ts
git commit -m "feat(nebu): orchestrate assignment understanding"
```

---

### Task 6: Assignment list and lightweight creation UI

**Files:**
- Create: `app/assignments/page.tsx`
- Create: `app/assignments/new/page.tsx`
- Create: `app/assignments/new/AssignmentCreateForm.tsx`
- Create: `components/nebu/NebuHeader.tsx`
- Create: `lib/assignments/list-view-model.ts`
- Create: `lib/assignments/list-view-model.test.ts`
- Modify: `app/dashboard/DashboardClient.tsx`

**Interfaces:**
- Consumes: `getAssignmentList`, owned course query, and `createAssignmentAction`.
- Produces: Reachable `/assignments` and `/assignments/new` routes.

- [ ] **Step 1: Add failing view-model tests for assignment cards**

Create `lib/assignments/list-view-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  formatAssignmentDueDate,
  getAssignmentStageLabel,
  getUnderstandingStatusLabel,
} from "./list-view-model";

describe("assignment list presentation", () => {
  it("does not fabricate a missing due date", () => {
    expect(formatAssignmentDueDate(null)).toBe("No due date added");
  });

  it("formats a date without local timezone drift", () => {
    expect(formatAssignmentDueDate("2026-09-30")).toBe("Sep 30, 2026");
  });

  it("uses stable English stage and analysis labels", () => {
    expect(getAssignmentStageLabel("setup")).toBe("Set up");
    expect(getUnderstandingStatusLabel("not_started")).toBe("Not analyzed");
    expect(getUnderstandingStatusLabel("processing")).toBe("Analyzing");
    expect(getUnderstandingStatusLabel("ready")).toBe("Ready");
    expect(getUnderstandingStatusLabel("failed")).toBe("Needs retry");
  });
});
```

Run `npx vitest run lib/assignments/list-view-model.test.ts` and observe failure because the module does not exist. Implement the three pure functions with exhaustive `Record` mappings. Parse `dueOn` as `${dueOn}T00:00:00Z` and format with `timeZone: "UTC"` so the label cannot move to the previous day.

- [ ] **Step 2: Implement `NebuHeader`**

The header shows:

```text
Nebu.AI        Assignments        [student email] [Sign out]
```

Use existing typography, color tokens, `Link`, and `signOut`. Do not globally rename the existing ReadableHTML landing page in this phase.

- [ ] **Step 3: Implement the authenticated assignment list**

`app/assignments/page.tsx`:

- redirects unauthenticated users to `/login?next=/assignments`;
- fetches only owned assignments;
- shows course, assignment title, stage, due date, and understanding status;
- links each card to `/assignments/{id}/requirements`;
- shows a prominent `New Assignment` button;
- uses a simple empty state.

- [ ] **Step 4: Implement the create page and form**

The form supports:

- existing course selection;
- `Create a new course` option;
- course name, optional term, optional instructor name;
- assignment title;
- optional due date;
- pasted assignment brief;
- highly recommended context callout without building its upload controls.

Use `useFormState` from `react-dom` with `createAssignmentAction`. Display field errors next to their field and disable submit while pending.

- [ ] **Step 5: Add one reachable dashboard link**

Add a compact `Open Nebu.AI` link to the existing dashboard header. Do not restructure `DashboardClient`, delete the document library, or change existing upload behavior in this phase.

- [ ] **Step 6: Verify routes**

Run:

```bash
npm run lint
npx tsc --noEmit --incremental false
npm run dev
```

Manual check:

1. Unauthenticated `/assignments` redirects to login.
2. New-course fields toggle correctly.
3. Blank required fields show inline English errors.
4. Successful creation redirects to the owned requirements route.
5. Existing PDF dashboard behavior remains reachable.

- [ ] **Step 7: Commit the creation UI**

```bash
git add app/assignments components/nebu/NebuHeader.tsx lib/assignments/list-view-model.ts lib/assignments/list-view-model.test.ts app/dashboard/DashboardClient.tsx
git commit -m "feat(nebu): add assignment intake"
```

---

### Task 7: Requirements workspace and student confirmation

**Files:**
- Create: `app/assignments/[id]/requirements/page.tsx`
- Create: `app/assignments/[id]/requirements/RequirementsClient.tsx`
- Create: `components/nebu/RequirementsWorkspace.tsx`
- Create: `components/nebu/RequirementCard.tsx`
- Create: `lib/assignments/view-model.ts`
- Create: `lib/assignments/view-model.test.ts`

**Interfaces:**
- Consumes: `AssignmentWorkspaceData`, `analyzeAssignmentAction`, and `reviewRequirementAction`.
- Produces: the first usable Assignment Understanding workflow.

- [ ] **Step 1: Write failing view-model tests**

Create `lib/assignments/view-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AssignmentRequirementV1 } from "../contracts/nebu/v1";
import { buildRequirementsViewModel, getReasoningLabel } from "./view-model";

function requirement(
  id: string,
  reviewStatus: AssignmentRequirementV1["reviewStatus"],
  reasoningClass: AssignmentRequirementV1["reasoningClass"] = "required",
): AssignmentRequirementV1 {
  return {
    schemaVersion: 1,
    id,
    assignmentId: "assignment-1",
    kind: "constraint",
    text: `Requirement ${id}`,
    reasoningClass,
    reviewStatus,
    origin: "ai",
    studentEdited: false,
    support: reasoningClass === "required"
      ? { materialId: "brief-1", quote: "Use evidence", start: 0, end: 12 }
      : null,
    orderIndex: Number(id.slice(-1)),
  };
}

describe("buildRequirementsViewModel", () => {
  const requirements = [
    requirement("item-1", "confirmed"),
    requirement("item-2", "proposed", "inference"),
    requirement("item-3", "rejected"),
  ];

  it("places only confirmed items in trusted context", () => {
    expect(buildRequirementsViewModel(requirements, false).trustedContext.map((item) => item.id))
      .toEqual(["item-1"]);
  });

  it("keeps proposed items in Nebu proposals", () => {
    expect(buildRequirementsViewModel(requirements, false).nebuProposals.map((item) => item.id))
      .toEqual(["item-2"]);
  });

  it("keeps rejected items out of active groups", () => {
    const view = buildRequirementsViewModel(requirements, false);
    expect([...view.trustedContext, ...view.nebuProposals].map((item) => item.id))
      .not.toContain("item-3");
    expect(view.rejectedCount).toBe(1);
  });

  it("uses transparent reasoning labels", () => {
    expect(getReasoningLabel("required")).toBe("Required");
    expect(getReasoningLabel("inference")).toBe("Inference");
  });

  it("strongly recommends a missing rubric without blocking progress", () => {
    expect(buildRequirementsViewModel(requirements, false).contextNotice).toBe(
      "No rubric added. Uploading it is highly recommended for more precise guidance.",
    );
    expect(buildRequirementsViewModel(requirements, true).contextNotice).toBeNull();
  });
});
```

- [ ] **Step 2: Run and observe failure**

```bash
npx vitest run lib/assignments/view-model.test.ts
```

- [ ] **Step 3: Implement the pure view model**

Return:

```ts
interface RequirementsViewModel {
  trustedContext: AssignmentRequirementV1[];
  nebuProposals: AssignmentRequirementV1[];
  rejectedCount: number;
  contextNotice: string | null;
}
```

Implement `buildRequirementsViewModel(requirements, rubricAvailable)` and `getReasoningLabel(reasoningClass)`. Sort by `orderIndex`. Never derive trust from `reasoningClass`; trust comes from `reviewStatus`. Use the exact missing-rubric notice asserted by the test.

- [ ] **Step 4: Implement the authenticated server page**

The page:

- requires authentication;
- loads owned workspace data;
- calls `notFound()` for missing or inaccessible assignments;
- passes contract-mapped data to `RequirementsClient`;
- never passes storage paths, user IDs unrelated to rendering, or provider credentials.

- [ ] **Step 5: Implement analysis start/retry behavior**

On first load with `understandingStatus='not_started'`, show a primary `Analyze assignment` action. Do not fire a hidden server action from render.

While processing:

- disable duplicate triggers;
- show `Nebu is analyzing your assignment brief…`;
- poll by `router.refresh()` no faster than every two seconds, stopping on Ready or Failed.
- after five minutes from `latestAnalysisJob.startedAt`, stop polling and show `Analysis is taking longer than expected` with a `Try again` action; the start RPC expires the stale job before retrying.

On failure, preserve the brief and show the stored error plus `Try again`.

- [ ] **Step 6: Implement the three-area workspace**

Left trusted-reference panel:

- confirmed requirements only;
- collapsible;
- empty message: `Confirm Nebu’s proposals to build trusted assignment context.`

Center:

- Assignment Understanding heading;
- brief source viewer;
- proposed requirement cards grouped by kind;
- missing-rubric notice.

Right Nebu panel:

- explains Required versus Inference;
- shows processing/failure status;
- contains no open-ended chat in this phase.

Persist side-panel collapsed state in `localStorage` under versioned keys:

```text
nebu:v1:workspace:left-collapsed
nebu:v1:workspace:right-collapsed
```

- [ ] **Step 7: Implement requirement decisions**

Each Proposed card shows:

- type label;
- text;
- Required or Inference label;
- exact support quote and source location for Required items;
- Confirm;
- Edit and confirm;
- Reject.

Nothing moves to the left panel until the server confirms the decision and the route refreshes. An action failure restores the card and displays an inline error.

- [ ] **Step 8: Run tests and manual workflow**

```bash
npm run test:nebu
npm run lint
npx tsc --noEmit --incremental false
```

Manual flow:

1. Create a course and assignment with a brief containing a word limit.
2. Run analysis.
3. Verify the word-limit item quotes the exact brief.
4. Confirm one item; it moves to the left trusted panel.
5. Edit and confirm one item; edited text is retained and source remains inspectable.
6. Reject one item; it disappears from active groups and is counted.
7. Verify no rubric is generated and the rubric recommendation remains.
8. Sign in as another user and verify the assignment URL returns not found.

- [ ] **Step 9: Commit the requirements workspace**

```bash
git add 'app/assignments/[id]/requirements' components/nebu/RequirementsWorkspace.tsx components/nebu/RequirementCard.tsx lib/assignments/view-model.ts lib/assignments/view-model.test.ts
git commit -m "feat(nebu): add assignment understanding workspace"
```

---

### Task 8: Phase verification and operator documentation

**Files:**
- Modify: `README.md`
- Create: `docs/nebu/assignment-understanding-alpha.md`

**Interfaces:**
- Consumes: all prior Phase 1 tasks.
- Produces: reproducible setup, verification evidence, and alpha-operating notes.

- [ ] **Step 1: Document exact local setup**

Add:

- Supabase CLI and container-runtime requirement;
- `npx supabase start` and `npx supabase db reset`;
- platform `OPENAI_API_KEY` requirement for analysis;
- routes `/assignments`, `/assignments/new`, and `/assignments/{id}/requirements`;
- clear Phase 1 exclusions;
- retry and failure behavior;
- no production migration or deployment instructions.

- [ ] **Step 2: Run the complete automated suite**

```bash
npm run test:contract
npm run test:nebu
npm run test:db
npx tsc --noEmit --incremental false
npm run lint
git diff --check
```

Expected:

- Document contract tests remain green.
- Nebu tests are green.
- pgTAP tests are green.
- No new TypeScript or lint findings beyond the recorded baseline.
- `git diff --check` prints nothing.

- [ ] **Step 3: Execute the end-to-end Phase 1 acceptance flow**

Use two local users and verify:

```text
User A creates course and assignment
→ Nebu analyzes the pasted brief
→ every Required item opens an exact source quote
→ User A confirms, edits, and rejects proposals
→ confirmed items appear in trusted context
→ retry does not delete confirmed decisions
→ User B cannot list or open User A data
```

Record model/provider, test brief, observed duration, and any failure in `docs/nebu/assignment-understanding-alpha.md`. Do not include API keys or real student data.

- [ ] **Step 4: Review scope before completion**

Reject the phase as over-scoped if it contains any of:

- file upload;
- course insight generation;
- PDF evidence cards;
- general Nebu chat;
- draft editor;
- citations;
- payment UI;
- vector search;
- Google Docs.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md docs/nebu/assignment-understanding-alpha.md
git commit -m "docs(nebu): document assignment understanding alpha"
```

## Phase 1 completion gate

Phase 1 is complete only when:

- an authenticated student can create an assignment from pasted text;
- Nebu returns structurally valid proposals;
- every Required proposal has an exact, inspectable source quote;
- a missing rubric produces a recommendation, not an invented rubric;
- confirmed, proposed, and rejected states remain distinct;
- retry never deletes confirmed student decisions;
- RLS prevents cross-user reads and writes;
- the existing PDF/document experience remains reachable and unchanged;
- all new tests pass and baseline findings are reported honestly.
