# Nebu.AI V1 Product and Technical Design

**Status:** Approved design awaiting written-spec review  
**Date:** 2026-08-21  
**Product:** Nebu.AI  
**Assistant name:** Nebu  
**Delivery:** English-first web application

## 1. Purpose

Nebu.AI is a course-aware essay workspace for university humanities students. It helps a student turn assignment requirements, course-specific guidance, readings, and their own thinking into a well-supported essay.

The central product insight is that successful academic writing depends on more than generic writing quality. Students must understand and apply the nuances of a particular course: the assignment brief, rubric, recurring lecture themes, professor and teaching-assistant guidance, office-hour notes, and feedback on previous work.

The product promise is:

> Turn what your course teaches into what your essay argues.

Nebu.AI is not primarily a PDF reader, PDF-to-HTML converter, generic chatbot, grammar checker, citation manager, or automatic essay writer. Those capabilities are either supporting tools or explicit non-goals.

## 2. Target user and primary job

The V1 user is an English-speaking or English-writing humanities university student who:

- reads multiple academic sources for each assignment;
- receives important guidance across briefs, rubrics, lectures, slides, seminars, office hours, and written feedback;
- struggles to keep that guidance visible while researching and writing;
- needs to connect source evidence to claims and grading expectations;
- wants practical AI assistance without surrendering authorship.

The primary job is:

> Help me understand what this assignment and course expect, collect relevant evidence, form my own argument, and revise my draft in response to traceable course guidance.

## 3. Product principles

### 3.1 Assignment first

The assignment, not a blank document or uploaded PDF, is the main organizing object. Reading, planning, writing, citation, and AI assistance occur inside an Assignment Workspace.

### 3.2 Course-aware personalization

Personalization means personalization to this student, course, professor, teaching assistant, and assignment. It does not mean merely changing tone, reading level, or response length.

### 3.3 Student-owned authorship

The student writes the essay. Nebu may explain, diagnose, propose thesis or topic-sentence options, recommend changes, and provide short replacement wording when requested. Nebu does not generate a complete essay or silently replace student text.

### 3.4 Provenance before confidence

Any statement about what a professor, teaching assistant, rubric, or course expects must link to supporting material. AI inference is labelled as inference even when it appears plausible.

### 3.5 Confirmation before memory

AI may propose course insights, but only a student-confirmed insight becomes trusted course memory. Rejected or unreviewed proposals do not guide the essay automatically.

### 3.6 Original sources remain authoritative

Extracted content, AI explanations, and generated metadata never replace the original uploaded material. Students can inspect the source context behind evidence, requirements, and insights.

### 3.7 Incremental migration

The existing ReadableHTML repository is evolved rather than rewritten. Its PDF ingestion, source anchoring, authentication, storage, row-level security, and LLM provider work remain useful subsystems.

## 4. Scope

### 4.1 Included in V1

- Authentication and private student accounts
- Courses with persistent course-level memory
- Assignment creation and Assignment Understanding
- PDF, DOCX, PPTX, and pasted-text materials
- Rubrics, lecture materials, teaching-assistant notes, office-hour notes, and previous graded work
- Proposed, confirmed, and rejected insights
- Original-PDF reading and text selection
- Source-anchored evidence cards
- Argument planning with claims, counterarguments, and paragraph purposes
- Integrated structured writing editor
- Nebu course-aware coaching
- Explicitly accepted short AI wording suggestions
- Autosave and recoverable draft versions
- MLA and Chicago Notes and Bibliography citation styles
- One-click quote, citation, footnote, and evidence-placeholder insertion
- Automatic footnote renumbering and bibliography generation
- DOCX export and clean rich-text copy
- Private-alpha usage controls and a later isolated billing boundary
- English-only product interface, with localization keys used internally from the beginning

### 4.2 Explicitly excluded from V1

- PDF-to-readable-HTML reconstruction as a product workflow
- Full-essay or full-paragraph generation
- Global student memory across courses
- Audio recording or transcription
- Real-time collaboration
- Google Docs integration
- Zotero integration
- Learning-management-system integration
- Direct university submission
- APA or a broad citation-style catalogue
- A separate vector database
- Mobile-first essay editing
- Teacher, institution, or administrator dashboards
- Public sharing
- Guaranteed academic-integrity certification

### 4.3 Deferred without affecting the V1 contracts

The production model, exact subscription price, public-beta limits, semantic retrieval, global student profile, and third-party integrations are deployment or later-product decisions. V1 contracts must not hard-code them.

## 5. Information hierarchy

```text
Student Account
└── Course
    ├── Course Materials
    ├── Confirmed Course Insights
    ├── Previous Work and Feedback
    └── Assignment
        ├── Requirements
        ├── Assignment Materials
        ├── Sources and Evidence
        ├── Argument Plan
        ├── Draft and Versions
        └── AI Suggestions
```

Course-level memory persists across assignments in the same course. Assignment-specific instructions and decisions do not automatically become course-wide memory.

V1 does not carry professor or course preferences into unrelated courses. A future global writing profile must be a separate layer with separate confirmation rules.

## 6. Primary screens

### 6.1 Home

The home screen shows:

- active assignments;
- course name;
- due date when supplied;
- current stage: Setup, Research, Planning, or Writing;
- a prominent New Assignment action.

V1 does not require a complex productivity dashboard, calendar, grade tracker, or analytics surface.

### 6.2 Create Assignment

Required fields:

- Course
- Assignment title
- Assignment brief, supplied by upload or paste

Highly recommended context:

- Rubric
- Professor or teaching-assistant notes
- Previous graded work and feedback

Recommended context:

- Lecture notes and slides
- Course readings

The student can enter the workspace after providing the required fields. Missing optional material does not block progress.

The screen shows a Context Readiness checklist. It explains the practical benefit of each missing item without using an arbitrary percentage or implying false completeness.

Examples:

- “Add your rubric so Nebu can check recommendations against grading criteria.”
- “Add previous feedback so Nebu can identify recurring student-specific issues.”

### 6.3 Assignment Workspace

The workspace contains four persistent modes:

1. **Requirements** — assignment understanding, confirmed constraints, rubric, ambiguities, and relevant course insights
2. **Sources** — materials, original PDF reader, highlights, and evidence cards
3. **Plan** — thesis options, claims, counterarguments, evidence links, and paragraph purposes
4. **Draft** — structured editor, outline, citations, and revision assistance

The layout has three areas:

```text
┌────────────────────┬─────────────────────────────┬────────────────────┐
│ Trusted Reference  │                             │                    │
│ Layer              │      Primary Work Area      │       Nebu         │
│                    │                             │                    │
└────────────────────┴─────────────────────────────┴────────────────────┘
```

Both side panels are independently collapsible. The center work surface remains visually dominant.

### 6.4 Left-panel contract

The left panel is the trusted reference layer. Its content changes with the active mode:

- Requirements: confirmed requirements and course insights
- Sources: reading list, highlights, and saved evidence
- Plan: claims, counterarguments, and evidence bank
- Draft: outline, paragraph goals, relevant evidence, and confirmed guidance

The left panel contains student-uploaded, student-saved, or student-confirmed information. It does not silently mix in unconfirmed AI conclusions.

### 6.5 Right-panel contract

The right panel is Nebu. It contains:

- explanations;
- questions;
- recommendations;
- suggested connections;
- revision feedback;
- unconfirmed AI inferences.

Nothing from the Nebu panel becomes trusted memory or modifies the draft without an explicit student action.

### 6.6 Visual and interaction direction

The V1 workspace is desktop-first, restrained, and editorial. Zotero is the primary interaction reference for compact controls and collapsible utility panels; Big Ideas Database is a visual reference for clean hierarchy and readable typography. Nebu.AI does not copy either product’s branding.

- English is the only shipped interface language in V1.
- The top toolbar is compact and icon-first; infrequent actions live in overflow menus.
- Both side-panel states persist per student.
- The center work surface receives the greatest width and visual emphasis.
- Source content, student writing, and AI assistance use visibly different treatments.
- Keyboard navigation, visible focus states, semantic labels, and sufficient contrast are required.
- Narrow screens may support review and light editing, but the full V1 writing workflow is designed for laptop and desktop widths.

## 7. End-to-end workflow

### 7.1 Create an assignment

The student selects or creates a course, names the assignment, and uploads or pastes the brief. The workspace opens immediately.

### 7.2 Confirm Assignment Understanding

Nebu proposes an editable Assignment Understanding containing:

- central question;
- required deliverables;
- explicit constraints;
- word limit and dates when present;
- rubric criteria when present;
- explicit expectations;
- ambiguous or missing information.

The student confirms or corrects each requirement. A missing rubric is allowed. In that case, rubric-specific conclusions are visibly unavailable, and Nebu must not generate an assumed rubric.

### 7.3 Build course context

The student adds course materials and notes. Nebu proposes structured course insights. The student confirms, edits, or rejects each proposal.

Previous graded essays and professor or teaching-assistant feedback are optional but highly recommended. Nebu may propose:

- recurring strengths;
- repeated weaknesses;
- professor or teaching-assistant comments;
- patterns associated with stronger or weaker grades;
- citation, structure, and argument preferences;
- student-specific improvement goals.

### 7.4 Read and collect evidence

The student opens a reading in the original PDF reader. Selecting text exposes:

- Explain
- Clarify implication
- Connect to assignment
- Save as evidence
- Ask Nebu

A saved evidence card contains:

- exact quotation;
- material identity;
- page or slide number;
- stable source anchor;
- student note;
- optional relevant course insight;
- optional plan connection;
- AI explanation stored separately from the quotation.

### 7.5 Build the argument

Nebu assists the student in constructing:

- thesis options;
- main claims;
- counterarguments;
- evidence attached to each claim;
- rubric connections;
- course-guidance connections;
- paragraph purposes;
- missing-evidence warnings.

The student chooses, edits, reorders, and rejects these elements. The argument plan is not generated essay prose.

### 7.6 Write

In Draft mode:

- the left panel displays outline, evidence, and confirmed insights;
- the center displays the editor;
- the right panel displays Nebu.

The student can insert evidence, a citation, a footnote, or an evidence placeholder. Insertion never automatically adds AI-authored analytical prose.

### 7.7 Review

The student can request:

- paragraph-purpose review;
- argument and counterargument review;
- evidence-support review;
- rubric alignment;
- course-insight alignment;
- citation warnings;
- unsupported-claim warnings.

Feedback states why the change matters and cites the course or source support behind it. Any suggested wording requires explicit acceptance.

### 7.8 Export

The student can export a DOCX document or use clean rich-text copy. Export includes the draft, formatted citations, footnotes, and bibliography. Nebu-only UI, unaccepted suggestions, and internal evidence metadata are excluded.

## 8. Material ingestion

### 8.1 Material types

Each material is classified as one of:

- assignment brief;
- rubric;
- professor lecture notes;
- lecture slides;
- teaching-assistant or office-hour notes;
- previous graded work;
- previous feedback;
- course reading;
- student note;
- other course material.

Classification can be chosen by the student or proposed by Nebu. The student can correct it.

### 8.2 Formats and extraction contracts

Material adapters share a small contract: accept an original file or pasted text and emit source-anchored fragments plus processing metadata.

- **PDF:** existing canonical document contract; page and bounding-box anchors when available
- **DOCX:** paragraphs, headings, footnotes, and comment text; comments retain author and referenced text when extractable
- **PPTX:** slide number, title, body text, and speaker notes when present
- **Pasted text:** exact stored text with line or character-offset anchors

If DOCX comments, tracked changes, slide visuals, scanned pages, or other content cannot be reliably extracted, the material is marked Partial. Nebu must not claim completeness.

### 8.3 Processing states

```text
uploaded → processing → ready
                     ↘ partial
                     ↘ failed
```

- Ready means the supported extraction contract completed.
- Partial means some useful content is available but identified content could not be reliably extracted.
- Failed means no reliable extracted representation is available.

The original source remains available in every state. A failed or partial material can be retried or supplemented with pasted text.

## 9. Course intelligence

### 9.1 Insight record

Every proposed or confirmed insight includes:

- exact claim;
- category;
- course or assignment scope;
- status: proposed, confirmed, or rejected;
- origin: user-authored or AI-proposed;
- confidence as extraction metadata, not as proof;
- one or more source links;
- created and updated timestamps.

Useful categories include:

- explicit requirement;
- grading priority;
- conceptual emphasis;
- structural preference;
- evidence preference;
- citation preference;
- recurring student strength;
- recurring student weakness;
- assignment interpretation.

### 9.2 Source link

An insight source contains:

- material ID;
- exact supporting quotation or text;
- source anchor;
- page, slide, or text location;
- optional speaker or author identity;
- optional date supplied by the student.

### 9.3 Confirmation rules

- AI-proposed insights start as Proposed.
- Only Confirmed insights enter trusted context automatically.
- Editing a proposed insight and confirming it records the student-edited wording.
- Rejecting an insight prevents it from being used unless the student later restores it.
- A student can create a confirmed insight manually.
- AI cannot confirm, promote, or broaden the scope of an insight.

### 9.4 Conflicting guidance

Nebu does not silently resolve conflicting guidance.

It must:

1. show both instructions;
2. cite both sources;
3. identify explicit rubric or assignment constraints as higher-authority constraints;
4. explain why contextual guidance may differ;
5. ask the student which interpretation applies to the assignment;
6. save the student’s decision as assignment-scoped context.

Recency alone does not automatically override earlier guidance.

## 10. Evidence and source anchors

The existing versioned canonical-document contract remains the source of truth for PDF extraction. It supports stable document and block IDs, exact source text, page numbers, bounding boxes, reading order, citations, footnotes, tables, figures, and extraction fallback metadata.

An evidence anchor must include enough information to recover a selection after non-destructive reprocessing:

- material ID;
- canonical block ID or format-specific fragment ID;
- zero-based, end-exclusive offsets where text selection applies;
- selected quotation;
- quotation checksum;
- page or slide number;
- bounding box when available.

If an anchor can no longer resolve exactly, the evidence card remains visible but is flagged for source verification. Nebu does not quietly attach it to a different passage.

## 11. Argument plan

The plan is a structured set of nodes, not a single generated outline string.

Node types include:

- thesis;
- claim;
- counterargument;
- response;
- paragraph;
- introduction purpose;
- conclusion purpose.

Each node can contain:

- student-authored or accepted text;
- position and parent relationship;
- relevant requirement links;
- relevant course-insight links;
- evidence links;
- missing-evidence status;
- optional draft paragraph relationship.

Nebu can propose plan nodes, but the student controls final inclusion and order.

## 12. Draft editor

### 12.1 Editor model

V1 uses a ProseMirror-based editor, recommended implementation: Tiptap. The persisted draft is a versioned structured editor document, not rendered HTML.

Required node or mark types include:

- paragraph;
- heading;
- block quote;
- emphasis and strong text;
- inline citation;
- footnote reference;
- footnote body;
- evidence link;
- bibliography section;
- temporary unsupported-claim marker.

HTML is a rendering/export format, not the durable source of truth.

### 12.2 AI suggestion behavior

Nebu may provide:

- thesis and topic-sentence options;
- short rewrite suggestions;
- transition examples;
- counterargument prompts;
- paragraph-level revision instructions.

Nebu must not:

- silently edit the document;
- replace the whole document;
- generate a submission-ready essay;
- generate a complete analytical paragraph for direct insertion.

Every insertion requires an explicit student action. The prior version remains recoverable.

### 12.3 Autosave and versions

- Debounced autosave persists current editor state.
- Periodic snapshots and pre-AI-acceptance snapshots create recoverable versions.
- A failed save is visible and retried without discarding local editor state.
- Version restoration creates a new current version; it does not delete later history.

## 13. Citations and footnotes

### 13.1 V1 styles

V1 ships:

- MLA
- Chicago Notes and Bibliography

Bibliographic metadata is stored in CSL-compatible structured form. Formatting is generated from the selected style; formatted strings are not the only stored representation.

### 13.2 Evidence actions

Every evidence card supports:

- Insert quote and citation
- Insert citation only
- Insert as footnote
- Insert evidence placeholder

### 13.3 Citation rules

- Citations remain linked to a bibliographic source record.
- Footnotes renumber when references move or are deleted.
- Students can edit locators, prefixes, suffixes, and explanatory footnote text.
- Bibliography updates from sources actually cited in the draft.
- Extracted metadata is labelled Unverified until the student confirms it.
- Missing metadata produces a warning.
- Nebu never invents authors, dates, titles, pages, publishers, or identifiers.

An explanatory footnote and a source citation are distinct editor structures even when Chicago formatting displays them together.

## 14. Nebu behavior contract

Nebu is an assignment-specific coach, not an unrestricted chatbot.

### 14.1 Response structure

Feature-specific responses use validated structured contracts. A coaching response contains:

- recommendation;
- why it matters;
- reasoning classification;
- support IDs;
- uncertainty;
- detected conflicts;
- suggested next action;
- optional short wording suggestion when requested.

### 14.2 Reasoning classifications

- **Required:** explicit assignment or rubric instruction
- **Course insight:** confirmed professor, teaching-assistant, lecture, or course guidance
- **Source-supported:** supported by an uploaded reading
- **Inference:** Nebu’s interpretation
- **General guidance:** writing or background knowledge not derived from the course

### 14.3 Mandatory behavior

Nebu must:

- identify the origin of material recommendations;
- distinguish support from inference;
- display uncertainty and conflicting guidance;
- restrict course claims to confirmed insights or explicit requirements;
- require acceptance before inserting text;
- preserve student-authored content;
- allow the student to inspect support context.

Nebu must not:

- convert inference into course memory automatically;
- describe an unsupported assumption as professor preference;
- fabricate source or citation metadata;
- hide disagreement among course sources;
- imply university-policy compliance;
- write a complete essay.

## 15. AI context assembly

The context assembler, not the UI or raw model provider, decides what Nebu receives.

Context priority is:

1. student’s current selection or question;
2. current paragraph or argument node;
3. explicit assignment requirements;
4. relevant confirmed course insights;
5. evidence already linked to the paragraph or node;
6. relevant excerpts retrieved from course materials;
7. general writing guidance only when required.

Every context item receives an opaque support ID plus provenance metadata. Nebu returns support IDs rather than inventing source descriptions. The server rejects unknown support IDs.

V1 retrieval uses:

- exact source anchors;
- confirmed structured insights;
- user-selected and plan-linked evidence;
- Postgres full-text search across extracted fragments.

No separate vector database is introduced. Retrieval sits behind an interface so a later Supabase pgvector implementation does not change Nebu response contracts.

The assembler enforces a context budget and does not indiscriminately send an entire course to the model.

## 16. Technical architecture

### 16.1 Existing foundation

The verified repository contains:

- Next.js 14 App Router and TypeScript;
- React 18 and Tailwind CSS;
- Supabase authentication, Postgres, storage, and row-level security;
- PDF processing and annotation modules;
- an OpenAI-compatible LLM provider abstraction;
- a versioned canonical-document V1 contract with contract tests.

These remain the foundation. Existing uncommitted canonical-contract work is not discarded or rewritten as part of the pivot.

### 16.2 Domain modules

New capabilities are isolated behind these domain boundaries:

- `courses` — course identity and course-memory lifecycle
- `assignments` — brief, requirements, status, and assignment decisions
- `materials` — ingestion, classification, processing, and format adapters
- `insights` — proposal, confirmation, rejection, scope, and provenance
- `evidence` — evidence-card lifecycle and source-anchor recovery
- `planning` — argument nodes and their relationships
- `drafts` — editor state, autosave, and versions
- `citations` — bibliographic records, formatting, footnotes, and export
- `ai-context` — retrieval, context budgeting, and support-ID construction
- `nebu` — feature-specific prompts and structured response validation
- `llm` — provider transport only
- `billing` — subscription events and entitlements when paid beta begins

A domain exposes a small public interface. UI components do not access unrelated tables directly. LLM providers do not contain course or essay rules.

### 16.3 Document subsystem

The existing `documents` domain becomes a material-processing subsystem. A material can refer to an existing document record and canonical document output. The material layer translates course and assignment ownership into the document subsystem without duplicating extraction logic.

### 16.4 Job processing

Material extraction and insight proposal are asynchronous jobs. V1 should continue using Postgres-backed job records and a separate worker entry point rather than introducing Redis or a workflow platform.

Jobs must be idempotent, expose attempts and terminal error state, and write only validated contract outputs.

## 17. Conceptual persistence model

The core relational records are:

```text
courses
assignments
materials
material_fragments
assignment_requirements
insights
insight_sources
evidence_cards
plan_nodes
plan_requirement_links
plan_insight_links
plan_evidence_links
drafts
draft_versions
bibliographic_sources
ai_suggestions
material_jobs
subscriptions        # added when paid beta begins
entitlements         # added when paid beta begins
```

Important invariants:

- Every user-owned root record carries `user_id` or is protected through a user-owned parent.
- An assignment belongs to exactly one course.
- A material belongs to a course and may optionally be assignment-scoped.
- Assignment-scoped context cannot be read by another assignment unless promoted explicitly.
- A confirmed AI-proposed insight has at least one source.
- Evidence has a quotation and source anchor.
- Plan links reference records in the same assignment and user ownership boundary.
- A draft has exactly one current structured document and zero or more immutable versions.
- A citation node references a bibliographic source owned by the same user and available to the assignment.
- AI suggestions are separate from trusted insights and draft content.

Structured JSON is appropriate for versioned editor state and validated model payloads. Ownership, status, provenance, evidence, and citation relationships remain relational.

## 18. Privacy and security

- Course data is private by default.
- Supabase row-level security applies to every new table.
- Storage paths are scoped by user ID.
- Materials cannot be publicly shared in V1.
- BYOK credentials remain in memory and are not persisted or logged.
- Server provider credentials never reach the client.
- The Nebu operator does not use student materials to train its own models.
- Before public launch, the configured production provider must be verified to offer API data terms that do not train on customer content by default; the applicable provider terms are disclosed to students.
- The product discloses the configured model provider that processes content.
- Deleting an assignment removes assignment-only draft, plan, evidence, suggestions, and materials.
- Deleting a course removes its assignments, materials, insights, drafts, and stored files after explicit confirmation.
- Course-level data survives assignment deletion unless the student deletes it separately.

Audio recording is excluded from V1. Students enter office-hour information as their own written notes.

## 19. Academic integrity

Nebu supports learning and revision but cannot certify policy compliance.

V1 must:

- preserve student-authored and AI-suggested changes separately;
- make AI insertion explicit;
- maintain source and evidence provenance;
- retain recoverable revision history;
- refuse one-click full-essay generation;
- remind students that institutional AI rules differ and remain their responsibility.

V1 must not market itself as undetectable AI, a grade guarantee, or proof of academic-integrity compliance.

## 20. Error handling

### 20.1 Material errors

- Partial extraction identifies unavailable content.
- Failed extraction preserves the original file.
- Retry is explicit and idempotent.
- Manual paste provides a fallback.
- Source-dependent features remain disabled for unavailable fragments rather than guessing.

### 20.2 AI errors

If a provider is unavailable, rate-limited, unconfigured, or returns invalid structured output:

- drafting and autosave continue;
- no trusted context changes;
- no suggestion is marked accepted;
- the UI displays a specific retryable error;
- unknown support IDs are removed or cause response rejection;
- the original user request can be retried.

### 20.3 Save errors

- Local editor state is retained while a server save retries.
- The UI shows Saved, Saving, or Save failed.
- Navigation warns before leaving with unsaved state.
- Version restoration never destroys existing version history.

### 20.4 Citation errors

- Missing or unverified metadata is visible.
- Export is blocked only when valid output is impossible; otherwise it proceeds with explicit warnings.
- Page numbers and identifiers are never inferred when absent.

## 21. Billing boundary and launch sequence

### 21.1 Private alpha

- 10–20 humanities students
- Free access
- Manually observed end-to-end assignments
- No payment UI

### 21.2 Validation beta

- Invite-only
- Measure repeated use within the same assignment and course
- Measure whether students reach a draft and use source-backed feedback

### 21.3 Paid beta

Use a single student subscription through Stripe Checkout. The integration flow is:

```text
Stripe Checkout
→ signed Stripe webhook
→ subscription record
→ entitlement service
→ usage and feature checks
```

UI, course, draft, and AI modules never contain direct Stripe logic. Exact price and limits are selected after alpha usage reveals model and storage costs.

## 22. Verification strategy

### 22.1 Contract tests

- Course, assignment, material, insight, evidence, plan, draft, citation, and Nebu response schemas
- Cross-record scope and ownership invariants
- Version compatibility for stored editor documents and AI payloads

### 22.2 Database and security tests

- Row-level-security tests with two different users
- Parent-child ownership enforcement
- Assignment-versus-course scope enforcement
- Cascade and explicit deletion behavior

### 22.3 Ingestion tests

- PDF, DOCX, PPTX, and pasted-text fixtures
- Page, slide, comment, footnote, and offset anchors
- Ready, Partial, and Failed states
- Idempotent processing retries

### 22.4 Trust tests

- AI proposals cannot self-confirm
- Confirmed insights retain sources
- Rejected insights do not enter context
- Conflicts remain visible
- Unknown support IDs are rejected
- AI inference is not rendered as course fact

### 22.5 Evidence and citation tests

- Exact selection recovery
- Changed-source recovery failure is visible
- Quote and citation insertion
- MLA formatting
- Chicago footnote formatting
- Footnote renumbering
- Bibliography updates
- Missing metadata warnings
- No invented metadata

### 22.6 Editor tests

- Autosave
- Save-failure recovery
- Version creation and restoration
- AI suggestion acceptance and rejection
- Pre-acceptance version recovery
- Evidence links survive ordinary editor operations

### 22.7 End-to-end acceptance test

```text
Create course
→ Create assignment
→ Confirm requirements
→ Add and confirm a course insight
→ Open a PDF and save evidence
→ Connect evidence to a claim
→ Write a paragraph
→ Insert a Chicago footnote
→ Request source-backed Nebu review
→ Accept or reject a suggestion
→ Export the draft
```

## 23. Product success and acceptance

V1 is technically complete only when a real student can finish the end-to-end flow without developer intervention.

The core product success event is:

> A student completes a draft in which major claims are connected to evidence and structural decisions can be checked against the assignment and confirmed course guidance.

Private-alpha observation should answer:

- Do students add the highly recommended course context?
- Do they confirm or correct Nebu’s Assignment Understanding?
- Do they save evidence rather than merely chat with a PDF?
- Do they use course insights during planning or revision?
- Do they write inside Nebu rather than abandoning the workspace?
- Do they trust and inspect provenance labels?
- Do they return to the same course for another assignment?

Paid development should not expand to global student memory, broad integrations, or institutional features until the core loop produces repeat use.

## 24. Implementation sequencing constraint

This design describes the whole V1 but does not authorize a code-heavy build in one phase. Implementation must proceed through small, contract-first vertical slices. Each phase must have one user-visible or foundational outcome, an isolated responsibility, and proportional tests.

The implementation plan is created only after the user reviews and approves this written specification.
