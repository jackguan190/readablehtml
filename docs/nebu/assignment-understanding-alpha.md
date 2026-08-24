# Nebu.AI Assignment Understanding Alpha

## Purpose

This alpha validates the first Nebu.AI workflow:

```text
student creates course + assignment from pasted brief
→ Nebu analyzes the brief
→ student confirms, edits, or rejects proposed requirements
→ confirmed requirements become trusted assignment context
```

The assignment is the organizing object. A PDF reader, draft editor, citation
manager, payment flow, vector search, Google Docs integration, and open-ended
chat are intentionally out of scope for Phase 1.

## Local setup

Requirements:

- Supabase CLI
- Docker Desktop or another Supabase-compatible container runtime
- `.env.local` with:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `OPENAI_API_KEY` for platform analysis

Local database:

```bash
npx supabase start
npx supabase db reset
```

App:

```bash
npm run dev
```

Routes:

- `/assignments`
- `/assignments/new`
- `/assignments/{id}/requirements`

Do not use this document as production migration or deployment instructions.

## Verification commands

Run before considering Phase 1 complete:

```bash
npm run test:contract
npm run test:nebu
npm run test:db
npx tsc --noEmit --incremental false
npm run lint
git diff --check
```

Current Codex sandbox notes:

- `npm run test:contract` passes.
- `npm run test:nebu` passes.
- `npx tsc --noEmit --incremental false` passes.
- `npm run lint` passes with the pre-existing `components/NotesPanel.tsx`
  exhaustive-deps warning.
- `git diff --check` passes.
- `npm run dev` cannot be checked inside this sandbox because local port binding
  returns `EPERM`.
- `npm run build` cannot be checked inside this sandbox because network access to
  Google Fonts is blocked.
- `npm run test:db` must be run from the user’s host terminal because the Codex
  sandbox cannot access the Docker socket. Earlier Phase 1 DB tests passed 26/26
  on the host after Docker/Supabase setup.

## Manual acceptance flow

Use two local users. Do not use real student data or paste API keys into logs.

Test brief suggestion:

```text
Write a 1,500-word essay on how public memory shapes political legitimacy.
Use at least two course readings. Your essay must make an argument, not only
summarize the readings. The essay is due September 30, 2026.
```

Record for each run:

- date/time
- provider/model
- observed analysis duration
- whether every Required item displayed an exact source quote
- any failure message shown to the user

Expected flow:

```text
User A creates course and assignment
→ Nebu analyzes the pasted brief
→ every Required item opens an exact source quote
→ User A confirms one proposal
→ confirmed item appears in trusted context
→ User A edits and confirms one proposal
→ edited text remains, original source support remains inspectable
→ User A rejects one proposal
→ rejected item leaves active groups and increments rejected count
→ retry does not delete confirmed decisions
→ missing rubric recommendation remains; no rubric is invented
→ User B cannot list or open User A data
```

## Retry and failure behavior

- Analysis starts through `start_assignment_analysis`.
- A concurrent active job is rejected by the database unique index.
- Jobs older than five minutes are marked failed by the start RPC before retry.
- On provider, quota, validation, or persistence failure after a job starts,
  `fail_assignment_analysis` marks both the job and assignment failed.
- Completion uses `complete_assignment_analysis`, which deletes only AI Proposed
  requirements and preserves confirmed, rejected, and user-authored records.

## Scope guard

Reject Phase 1 as over-scoped if any of the following appear:

- file upload for course context
- course insight generation
- PDF evidence cards
- general Nebu chat
- draft editor
- citation insertion
- payment UI
- vector search
- Google Docs integration
