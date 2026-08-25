# Nebu Entry and First-Assignment Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make Nebu.AI the public web experience and route an authenticated first-time student through course and pasted-assignment creation before the existing Assignment Understanding review.

**Architecture:** Reuse the existing Supabase authentication, courses, assignments, materials, and Assignment Understanding vertical slice. Add a small pure navigation policy module so auth actions, middleware, and pages use one safe default. The new /onboarding server page chooses between the first-assignment form and the assignment library; public ReadableHTML routes become server redirects while legacy UI files remain dormant.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Supabase SSR, Supabase Postgres/RLS, Vitest, Tailwind CSS, lucide-react.

**Spec:** docs/superpowers/specs/2026-08-25-nebu-first-migration-design.md

## Global Constraints

- Ship an English-first desktop web experience; the public product name is Nebu.AI.
- Reuse the existing courses, assignments, materials, assignment_requirements, and assignment_analysis_jobs tables; this plan creates no database migration.
- This slice accepts a pasted assignment brief only. PDF, DOCX, and TXT file ingestion, Course Memory, Course Notes, and the writing workspace are separate follow-up plans.
- The student must explicitly review AI-proposed requirements before entering a future writing workspace; do not invent a rubric when none is present.
- Keep ReadableHTML PDF code dormant in the repository. Remove it from public entry points and navigation; do not delete it.
- Every protected Nebu route requires an authenticated Supabase user; ownership remains enforced by existing RLS policies.
- Do not deploy a cloud database migration as a side effect of implementation or Vercel deployment.
- Run npm run test:nebu, npm run test:db, npm run lint, and npm run build before declaring this plan complete.

---

## File structure

| Path | Responsibility |
| --- | --- |
| lib/nebu/navigation.ts | Pure policy for safe post-auth destinations and onboarding/library selection. |
| lib/nebu/navigation.test.ts | Regression tests for route safety and first-time/returning-user decisions. |
| app/onboarding/page.tsx | Authenticated route that sends returning users to the library or renders first-assignment onboarding. |
| app/onboarding/OnboardingAssignmentForm.tsx | First-use presentation wrapper around the existing assignment form; no database writes. |
| components/nebu/NebuLanding.tsx | Public Nebu marketing page and calls to action. |
| app/page.tsx | Chooses Nebu landing for visitors and an authenticated Nebu destination for signed-in users. |
| app/login/page.tsx, app/signup/page.tsx | Nebu-branded auth copy with /onboarding as the default destination. |
| lib/auth/actions.ts, lib/supabase/middleware.ts | Shared safe default and protection for the Nebu route family. |
| app/dashboard/page.tsx, app/documents/[id]/page.tsx | Legacy-route redirects that remove the old product workflow from public access. |
| app/layout.tsx | Nebu metadata. |

## Task 1: Establish the Nebu navigation contract

**Files:**
- Create: lib/nebu/navigation.ts
- Create: lib/nebu/navigation.test.ts
- Modify: lib/auth/actions.ts
- Modify: lib/supabase/middleware.ts

**Interfaces:**
- Consumes: A raw next string from a URL or form, and an assignment count obtained by an authenticated server page.
- Produces: resolveNebuNext(input: string | null): string and postAuthenticationPath(assignmentCount: number): "/onboarding" | "/assignments".

- [ ] **Step 1: Write the failing navigation-policy tests**

Create lib/nebu/navigation.test.ts:

~~~ts
import { describe, expect, it } from "vitest";
import { postAuthenticationPath, resolveNebuNext } from "./navigation";

describe("resolveNebuNext", () => {
  it("keeps an internal Nebu assignment path", () => {
    expect(resolveNebuNext("/assignments/a1/requirements")).toBe(
      "/assignments/a1/requirements",
    );
  });

  it("defaults missing, external, and legacy destinations to onboarding", () => {
    expect(resolveNebuNext(null)).toBe("/onboarding");
    expect(resolveNebuNext("https://attacker.example")).toBe("/onboarding");
    expect(resolveNebuNext("//attacker.example")).toBe("/onboarding");
    expect(resolveNebuNext("/dashboard")).toBe("/onboarding");
  });
});

describe("postAuthenticationPath", () => {
  it("sends a first-time student to onboarding", () => {
    expect(postAuthenticationPath(0)).toBe("/onboarding");
  });

  it("sends a returning student to assignments", () => {
    expect(postAuthenticationPath(1)).toBe("/assignments");
  });
});
~~~

- [ ] **Step 2: Run the new test to verify it fails**

Run: npx vitest run lib/nebu/navigation.test.ts  
Expected: FAIL because ./navigation does not exist.

- [ ] **Step 3: Implement the minimal pure policy**

Create lib/nebu/navigation.ts:

~~~ts
const NEBU_PREFIXES = ["/onboarding", "/assignments"] as const;

export function resolveNebuNext(input: string | null): string {
  if (
    input && input.startsWith("/") && !input.startsWith("//") &&
    NEBU_PREFIXES.some(
      (prefix) => input === prefix || input.startsWith(prefix + "/"),
    )
  ) return input;
  return "/onboarding";
}

export function postAuthenticationPath(
  assignmentCount: number,
): "/onboarding" | "/assignments" {
  return assignmentCount > 0 ? "/assignments" : "/onboarding";
}
~~~

Replace the private safeNext in lib/auth/actions.ts with resolveNebuNext, so password sign-in and sign-up email callbacks default to /onboarding. In lib/supabase/middleware.ts, protect /onboarding, /assignments, and /courses; redirect an authenticated visitor from /login or /signup to /onboarding, not /dashboard.

- [ ] **Step 4: Run focused verification**

Run: npx vitest run lib/nebu/navigation.test.ts lib/assignments/input.test.ts  
Expected: PASS. Existing assignment-input behavior remains unchanged.

- [ ] **Step 5: Commit the navigation contract**

Run:
~~~bash
git add lib/nebu/navigation.ts lib/nebu/navigation.test.ts lib/auth/actions.ts lib/supabase/middleware.ts
git commit -m "feat(nebu): add onboarding navigation policy"
~~~

## Task 2: Build the first-assignment onboarding route

**Files:**
- Create: app/onboarding/page.tsx
- Create: app/onboarding/OnboardingAssignmentForm.tsx
- Modify: app/assignments/new/AssignmentCreateForm.tsx
- Modify: app/assignments/new/page.tsx
- Test: lib/nebu/navigation.test.ts

**Interfaces:**
- Consumes: getAssignmentList, getOwnedCourses, postAuthenticationPath, and the existing createAssignmentAction.
- Produces: /onboarding, which redirects a returning student to /assignments and creates a first course and pasted brief for a new student.

- [ ] **Step 1: Add the zero-assignment onboarding invariant**

Append to lib/nebu/navigation.test.ts:

~~~ts
it("does not treat a course without assignments as completed onboarding", () => {
  expect(postAuthenticationPath(0)).toBe("/onboarding");
});
~~~

- [ ] **Step 2: Run the invariant test**

Run: npx vitest run lib/nebu/navigation.test.ts  
Expected: PASS after Task 1. It locks the rule that assignment count, not course count, determines first-use completion.

- [ ] **Step 3: Add the server route and onboarding form wrapper**

Create app/onboarding/page.tsx using this control flow:

~~~ts
const supabase = createSupabaseServerClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect("/login?next=/onboarding");
const [assignments, courses] = await Promise.all([
  getAssignmentList(supabase, user.id),
  getOwnedCourses(supabase, user.id),
]);
if (postAuthenticationPath(assignments.length) === "/assignments") {
  redirect("/assignments");
}
return <OnboardingAssignmentForm courses={courses} />;
~~~

Create app/onboarding/OnboardingAssignmentForm.tsx. It renders **Create your first assignment**, explains that requirements will be reviewed before Nebu uses them, and renders AssignmentCreateForm with mode="onboarding".

Extend AssignmentCreateFormProps with mode: "onboarding" | "library". In onboarding mode, retain existing field names and createAssignmentAction but use:

- course heading: **Your course**;
- a new course by default when the student owns no course;
- brief label: **Paste your assignment requirements**;
- helper text: **PDF, DOCX, and TXT upload will be added next. Paste the text for now.**

Pass mode="library" from app/assignments/new/page.tsx; retain its general-purpose copy.

- [ ] **Step 4: Run route and type verification**

Run: npx tsc --noEmit --incremental false && npx vitest run lib/nebu/navigation.test.ts lib/assignments/input.test.ts  
Expected: PASS. Manually verify unauthenticated /onboarding redirects to /login?next=/onboarding; after an assignment exists, /onboarding redirects to /assignments.

- [ ] **Step 5: Commit the first-time route**

Run:
~~~bash
git add app/onboarding/page.tsx app/onboarding/OnboardingAssignmentForm.tsx app/assignments/new/AssignmentCreateForm.tsx app/assignments/new/page.tsx lib/nebu/navigation.test.ts
git commit -m "feat(nebu): add first-assignment onboarding"
~~~

## Task 3: Replace public ReadableHTML entry points with Nebu

**Files:**
- Create: components/nebu/NebuLanding.tsx
- Modify: app/page.tsx
- Modify: app/layout.tsx
- Modify: app/login/page.tsx
- Modify: app/signup/page.tsx
- Modify: app/dashboard/page.tsx
- Modify: app/documents/[id]/page.tsx

**Interfaces:**
- Consumes: getAssignmentList, postAuthenticationPath, Supabase getUser, and existing auth forms.
- Produces: a public Nebu landing route, Nebu-branded auth routes, and legacy redirects to /assignments.

- [ ] **Step 1: Add the signed-in root-destination test**

Append to lib/nebu/navigation.test.ts:

~~~ts
it("uses onboarding as the root destination for a signed-in student with no assignments", () => {
  expect(postAuthenticationPath(0)).toBe("/onboarding");
});
~~~

- [ ] **Step 2: Run the navigation test**

Run: npx vitest run lib/nebu/navigation.test.ts  
Expected: PASS.

- [ ] **Step 3: Implement public replacement and legacy redirects**

Create components/nebu/NebuLanding.tsx with these actions:

~~~tsx
<Link href="/signup?next=/onboarding">Create your first assignment</Link>
<Link href="/login?next=/onboarding">Log in</Link>
~~~

Its copy describes a course-aware essay workspace, professor/TA guidance, assignment requirements, and student-owned writing. It must not mention PDF-to-HTML, ReadableHTML, OCR, scanned PDFs, or a full essay generator.

Replace app/page.tsx so an unauthenticated visitor receives NebuLanding; an authenticated visitor loads getAssignmentList and redirects using postAuthenticationPath(assignments.length). If Supabase environment variables are unavailable, render NebuLanding rather than throwing.

Set metadata in app/layout.tsx to:

~~~ts
title: "Nebu.AI — Course-aware essay workspace",
description: "Turn your course requirements, feedback, and notes into a stronger student-written essay.",
~~~

In app/login/page.tsx and app/signup/page.tsx, replace visible ReadableHTML branding with Nebu.AI, set searchParams.next ?? "/onboarding", preserve email/password behavior, and keep a return link to /.

Replace the rendered bodies of app/dashboard/page.tsx and app/documents/[id]/page.tsx with an authenticated server redirect to /assignments. Do not delete DashboardClient, DocumentClient, or document-domain libraries.

- [ ] **Step 4: Run build-oriented verification and smoke test**

Run: npm run lint && npm run build  
Expected: PASS with no new errors. Record any pre-existing lint warning separately; do not suppress it.

On local server or Vercel Preview configured with cloud Supabase, check:

1. Signed out at /: Nebu landing appears.
2. **Create your first assignment** opens signup with next=/onboarding.
3. After signup/login, a user with no assignment sees /onboarding.
4. Creating a course, title, and pasted brief opens /assignments/[id]/requirements.
5. Signed-in /dashboard and /documents/any-id both land at /assignments.

- [ ] **Step 5: Commit the public-product migration slice**

Run:
~~~bash
git add components/nebu/NebuLanding.tsx app/page.tsx app/layout.tsx app/login/page.tsx app/signup/page.tsx app/dashboard/page.tsx 'app/documents/[id]/page.tsx' lib/nebu/navigation.test.ts
git commit -m "feat(nebu): make Nebu the public entry point"
~~~

## Task 4: Verify the slice and prepare preview review

**Files:**
- Modify: docs/superpowers/specs/2026-08-25-nebu-first-migration-design.md
- Modify: docs/superpowers/plans/2026-08-25-nebu-entry-onboarding.md

**Interfaces:**
- Consumes: completed Tasks 1–3 and the existing Supabase local test stack.
- Produces: a preview-ready first migration slice with an accurate verification record.

- [ ] **Step 1: Run automated checks in dependency order**

~~~bash
npm run test:contract
npm run test:nebu
npm run test:db
npm run lint
npm run build
git diff --check
~~~

Expected: every command exits 0. If test:db fails because Docker/Supabase is stopped, start the local stack and rerun it; do not weaken or skip the test.

- [ ] **Step 2: Complete the authenticated acceptance test**

Use a fresh Preview test account to complete all five browser checks from Task 3. Append an **Implementation verification** section to both the plan and spec containing the actual completion date, the actual preview URL, the result of every automated check, the authenticated smoke-test result, and either the exact pre-existing warning text or `None`. Do not record a check as passing until its command has exited successfully.

- [ ] **Step 3: Verify commit scope**

Run: git status --short  
Expected: only files owned by Tasks 1–4 are staged or modified. Keep the pre-existing untracked .superpowers/ directory and supabase/.gitignore out of task commits.

- [ ] **Step 4: Commit verification records**

~~~bash
git add docs/superpowers/specs/2026-08-25-nebu-first-migration-design.md docs/superpowers/plans/2026-08-25-nebu-entry-onboarding.md
git commit -m "docs(nebu): record entry migration verification"
~~~

## Follow-up plan boundaries

Do not fold these into this plan:

1. Requirements-file ingestion: private upload, PDF/DOCX/TXT extraction, original-file storage, text-extraction failure state, and reviewed AI analysis from imported files.
2. Course Memory and Course Notes: material records, lightweight notes editor, insight proposal/review, source permissions, provenance, and deletion.
3. Writing workspace: rich-text student editor, drafts/versions, three-column collapsible UI, highlight-to-ask, context assembly, and explicit AI suggestion acceptance.
4. Alpha hardening: deletion cascade verification, accessibility pass, observability, upload limits, and production release runbook.

Each follow-up is an independent feature plan because it changes a separate data contract and needs its own database, UI, and review gate.
