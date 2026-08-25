# Nebu-first Migration Design

**Status:** User-approved written specification pending review  
**Date:** 2026-08-25  
**Product:** Nebu.AI  
**Delivery:** English-first desktop web application

## 1. Decision and intent

Nebu.AI replaces ReadableHTML as the public product. It is a course-aware essay workspace for university humanities students: a place to collect the assignment brief, professor and TA guidance, course materials, personal notes, and a student-written draft.

The product promise is:

> Help students turn what a particular course expects into what their essay argues.

The existing PDF extraction, document reader, and ReadableHTML landing experience are not part of the public V1. Their code and existing data contracts remain in the repository as dormant legacy capability so the team retains a rollback path. They must not appear in public navigation or create the impression that two different products are being offered.

This specification supersedes the product-entry, onboarding, material-format, and workspace-layout decisions in `2026-08-21-nebu-ai-v1-design.md` where they differ. It is the source of truth for the Nebu-first migration and its first release slice.

## 2. Target user and job to be done

The initial user is an English-writing humanities university student who repeatedly writes course essays and whose grade depends on nuanced expectations from the assignment brief, rubric, lectures, professor, and TA.

Their job is:

> Understand what this course and assignment require, preserve the important guidance I receive, construct my own argument, and revise my essay against traceable course evidence.

Nebu is a writing coach. It explains, questions, diagnoses, proposes options, and provides short student-controlled examples where explicitly requested. It does not default to writing a complete essay, silently rewrite a draft, or present submission-ready work as its primary output.

## 3. Public routes and navigation

```text
/                              Nebu.AI marketing page
/login and /signup              Nebu-branded authentication
/onboarding                     First course and first assignment intake
/courses                        Course library
/courses/[courseId]             Course Memory and its assignments
/assignments/[assignmentId]     Reviewed assignment requirements
/assignments/[assignmentId]/workspace
                               Three-column writing workspace
```

After authentication:

- a student with no assignment is sent to `/onboarding`;
- a returning student is sent to their course and assignment library;
- legacy PDF upload, dashboard, and document-reader routes are removed from public navigation and redirected to the relevant Nebu route.

The root landing page speaks only about Nebu.AI and uses **Create your first assignment** as its primary call to action.

## 4. Information model and ownership

```text
User
└── Course
    ├── Course Memory
    │   ├── imported materials
    │   ├── student-created Course Notes
    │   └── confirmed course insights
    └── Assignment
        ├── assignment sheet
        ├── reviewed requirements
        ├── assignment-specific materials
        ├── evidence and citation links
        ├── draft and draft versions
        └── AI suggestions and their outcomes
```

Course Memory belongs to one course and is reusable by that course's future assignments. Assignment-specific requirements and materials do not automatically become course-wide memory.

Every record is owned by the authenticated user. Row-level security must prevent any user from reading, updating, or deleting another user's courses, materials, drafts, extracted text, or AI outputs.

## 5. Onboarding, intake, and requirement review

The first-use flow asks for:

1. course name;
2. assignment title;
3. assignment brief supplied as pasted text or an upload.

The V1 accepted assignment-brief formats are pasted text, PDF, DOCX, and TXT. The original uploaded file is stored privately and remains the authoritative source; extracted text is a derivative used for analysis and display.

Nebu proposes a structured, editable Assignment Understanding:

- central task or question;
- required deliverables;
- formatting and citation requirements;
- word count, dates, and milestones when present;
- rubric criteria when provided;
- explicit constraints;
- missing or ambiguous information.

The student must review the proposed requirements before entering the writing workspace. They may accept, edit, reject, or add items. Nebu must never invent a rubric when none was supplied.

If text extraction cannot recover usable text from a document, Nebu reports that result plainly and offers the student a paste-text alternative. V1 does not claim OCR support for image-only or scanned documents.

## 6. Course Memory and Course Notes

After, or alongside, assignment intake, Nebu strongly recommends that the student add course context. It never blocks the student from continuing.

Supported context types are:

- rubric;
- lecture notes;
- professor guidance;
- TA feedback;
- office-hour notes;
- previous graded-essay feedback;
- student-created Course Notes.

The first six may be pasted or imported as PDF, DOCX, or TXT. **Course Notes** are a lightweight in-product editor for information the student learns during class, office hours, or conversation. A note has a title, body, type, timestamp, and optional tags. It auto-saves and is added directly to Course Memory.

Past graded essays and feedback are highly recommended context. Nebu may use their feedback to identify recurring preferences or issues, but it must not reuse their prose as a substitute for a new draft.

Nebu can propose a course insight from one or more materials. An insight becomes trusted Course Memory only when the student confirms it. The student can edit, reject, delete, or disable a source or insight from future AI context.

## 7. Workspace and AI boundaries

The assignment workspace is a desktop-first, three-column interface. Both side panels are independently collapsible.

```text
┌────────────────────────┬────────────────────────────┬──────────────────────┐
│ Trusted reference layer │ Student essay editor       │ Nebu writing coach   │
│ Requirements            │ Draft, outline, autosave  │ Explain / plan /     │
│ Rubric                  │ and version recovery      │ revise / ask         │
│ Course Memory           │                            │                      │
│ Evidence and sources    │                            │                      │
└────────────────────────┴────────────────────────────┴──────────────────────┘
```

The left panel contains student-provided or student-confirmed information: requirements, rubric, Course Memory, saved evidence, and citation cards. The central panel is the student's draft and remains visually dominant. The right panel contains Nebu's explanations, questions, recommendations, and unconfirmed inferences.

Students can highlight text and ask Nebu about a phrase, sentence, paragraph, or selected draft. Nebu supports:

- explanation of wording, concepts, implicit assumptions, and historical or course context;
- thesis, outline, argument-map, counterargument, and paragraph-purpose coaching;
- rubric-aware and feedback-aware revision guidance;
- locating relevant course evidence;
- a revision plan that the student can apply selectively;
- inserting an evidence card, citation placeholder, or footnote placeholder through an explicit action.

Nebu must distinguish in every response:

1. supported statements about the course, rubric, professor, or TA, each with a source link;
2. its own reasoning or recommendation, labelled as advice or inference;
3. the student's draft, which Nebu never changes without an explicit accept action.

V1 does not offer a default "write my full essay" action. If a student explicitly requests wording, Nebu may provide a short, editable example with the relevant requirements and source material identified.

## 8. AI context, provenance, and retrieval

An AI request uses only the smallest useful context set:

1. the selected text or current draft range;
2. reviewed assignment requirements;
3. relevant confirmed Course Memory fragments;
4. evidence or source cards explicitly selected by the student.

The initial retrieval strategy is assignment scope plus user-selected sources, exact source links, keyword matching, material type, and recency. It must not require a separate vector database for the first release.

Every material fragment and confirmed insight records source identity and text location. Each AI response that relies on a source returns source cards the student can open and inspect. If a source is absent or an inference is uncertain, Nebu says so rather than implying support.

## 9. Privacy, deletion, and exclusions

All documents, notes, drafts, feedback, and AI artifacts are private by default. The product must provide a way to delete a Course, Assignment, material, Course Note, or insight; deletion removes associated private storage and derived records according to the ownership hierarchy.

The first release explicitly excludes:

- the public ReadableHTML PDF-to-HTML reading workflow;
- scanned-document OCR and visual PDF reconstruction;
- PPTX, Google Docs, Zotero, LMS, or other third-party integrations;
- real-time collaboration, sharing, instructors, institutions, and class dashboards;
- audio recording or transcription;
- broad citation-style support and automatic final bibliography generation;
- global memory shared across courses;
- default full-essay generation;
- payments and subscriptions.

## 10. Delivery sequence and acceptance criteria

The migration is delivered in small, independently testable phases:

1. **Nebu entry and onboarding** — Nebu landing and auth routes, no public ReadableHTML navigation, course and first-assignment intake.
2. **Requirements review** — paste/PDF/DOCX/TXT ingestion, extraction failure states, structured AI requirement proposal, explicit student confirmation.
3. **Course Memory and Course Notes** — imported materials, lightweight notes, confirmed insights, provenance, and source-permission controls.
4. **Writing workspace** — collapsible three-column layout, student editor, autosave/version recovery, highlight-to-ask, and source-backed coaching.
5. **Alpha hardening** — security policies, deletion flows, upload/error handling, accessibility, observability, and preview-to-production release checks.

V1 is successful when a test student can complete a real assignment workflow and report that Nebu remembered the relevant course expectations and helped them apply those expectations to their own writing, while they retained control of both the sources and final draft.

## 11. Verification strategy

Each phase must include focused tests before implementation is considered complete:

- database tests for ownership, row-level security, confirmation state, and cascade deletion;
- unit tests for parsing, requirement review state, AI context assembly, and provenance rules;
- route and UI tests for onboarding, error states, edits, deletion, panel visibility, and explicit suggestion acceptance;
- an authenticated preview smoke test covering signup, assignment creation, requirement confirmation, Course Note creation, draft save, and a source-backed Nebu response.

Production deployment occurs only after the corresponding Vercel Preview passes the phase acceptance checks. Cloud database migrations are deployed separately and deliberately, never as an implicit side effect of a frontend deployment.
