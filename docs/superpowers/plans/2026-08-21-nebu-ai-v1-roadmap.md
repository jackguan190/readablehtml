# Nebu.AI V1 Delivery Roadmap

**Design source:** `docs/superpowers/specs/2026-08-21-nebu-ai-v1-design.md`

Nebu.AI V1 spans several independent subsystems. It must not be implemented as one code-heavy plan. Each phase below gets its own detailed implementation plan, test cycle, review gate, and commit history.

## Baseline gate

Before Nebu feature implementation begins:

1. Review and either commit or deliberately isolate the existing uncommitted Document V1 contract work.
2. Record the pre-existing TypeScript `vision_*` status error and `NotesPanel` hook warning as baseline findings.
3. Do not mix baseline cleanup with a Nebu feature commit.

## Phase 1: Assignment Understanding vertical slice

**User outcome:** An authenticated student creates a course and assignment from a pasted brief, Nebu proposes a source-backed Assignment Understanding, and the student confirms, edits, or rejects each item.

**Owns:** courses, assignments, pasted assignment-brief material, requirements, analysis job, first Nebu workspace routes.

**Excludes:** file upload, course insights, evidence, editor, citations, billing.

Detailed plan: `docs/superpowers/plans/2026-08-21-nebu-phase-1-assignment-understanding.md`

## Phase 2: Course materials and confirmed insights

**User outcome:** The student uploads or pastes rubric, lecture, TA, office-hour, and previous-feedback material; Nebu proposes traceable insights; the student confirms or rejects them.

**Owns:** material adapters for PDF, DOCX, PPTX, and text; material jobs; material fragments; insights; insight sources; conflict presentation.

**Excludes:** source highlighting and evidence cards.

## Phase 3: PDF evidence capture

**User outcome:** The student opens a PDF, selects exact text, asks for an explanation, and saves a source-anchored evidence card linked to the assignment.

**Owns:** document-to-material bridge, source selection contract, evidence cards, anchor recovery, evidence list.

**Depends on:** the existing canonical Document V1 contract and Phase 2 materials.

## Phase 4: Argument planning

**User outcome:** The student builds and rearranges a thesis, claims, counterarguments, paragraph purposes, and evidence connections.

**Owns:** plan nodes and requirement, insight, and evidence links; missing-evidence checks; Plan mode UI.

## Phase 5: Structured draft editor

**User outcome:** The student writes inside Nebu with autosave, recoverable versions, paragraph identities, and explicit AI suggestion acceptance.

**Owns:** Tiptap editor schema, drafts, draft versions, autosave, restore, and the Draft workspace.

**Excludes:** formatted citations and DOCX export.

## Phase 6: Citations, footnotes, and DOCX export

**User outcome:** The student inserts MLA or Chicago citations and footnotes from evidence, receives automatic numbering and bibliography updates, and exports a DOCX draft.

**Owns:** CSL-compatible bibliographic records, editor citation nodes, footnotes, formatting, metadata verification, export.

## Phase 7: Course-aware Nebu coaching

**User outcome:** Nebu reviews the current paragraph or argument using relevant requirements, confirmed insights, and evidence, with support labels and conflicts.

**Owns:** AI context assembler, support IDs, Postgres full-text retrieval, context budget, structured coaching responses, suggestion lifecycle.

**Excludes:** vector database and full-essay generation.

## Phase 8: Private-alpha hardening

**User outcome:** Ten to twenty invited humanities students can complete the full workflow reliably without developer intervention.

**Owns:** onboarding polish, usage instrumentation, privacy copy, deletion flows, accessibility verification, operational logging, failure recovery, alpha runbook.

## Phase 9: Paid-beta boundary

**User outcome:** An invited student can purchase one subscription and receive transparent entitlements and usage limits.

**Owns:** Stripe Checkout, signed webhooks, subscription records, entitlement service, billing portal, billing tests.

**Entry gate:** Build only after private-alpha evidence demonstrates repeated assignment use and reveals real AI/storage costs.

## Features deliberately outside this roadmap

- Google Docs integration
- Zotero or LMS integration
- Global student memory across courses
- Audio recording or transcription
- Public sharing and collaboration
- Institutional dashboards
- Full-essay generation
- Separate vector database
