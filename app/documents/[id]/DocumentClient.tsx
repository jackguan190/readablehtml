"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Trash2,
  Loader2,
  CircleAlert,
  CircleCheckBig,
  FileText,
  Info,
  Sparkles,
  Wand2,
  Scan,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/Sidebar";
import { ScanView } from "@/components/ScanView";
import { ReadingView, type RenderableMark, type SelectionPayload } from "@/components/ReadingView";
import { SplitView } from "@/components/SplitView";
import { NotesPanel, type Note } from "@/components/NotesPanel";
import { Drawer } from "@/components/Drawer";
import { MobileBottomBar } from "@/components/MobileBottomBar";
import { ViewToggle, type ViewMode } from "@/components/ViewToggle";
import {
  AiSettingsButton,
  aiSettingsDefault,
  type AiSettingsValue,
} from "@/components/AiSettings";
import {
  createAnnotation,
  deleteAnnotation,
  toggleHighlightAnnotation,
} from "@/lib/annotations/actions";
import {
  deleteDocument,
  restructureWithAI,
  restructureWithoutAI,
  runChandraForDocument,
  setParagraphMeta,
} from "@/lib/documents/actions";
import type {
  AnnotationRow,
  DocumentPageRow,
  DocumentRow,
} from "@/lib/documents/types";
import { pageRowToSection } from "@/lib/documents/types";
import { isHighlightColor, type HighlightColor } from "@/lib/annotations/colors";

interface Props {
  document: DocumentRow;
  pages: DocumentPageRow[];
  initialAnnotations: AnnotationRow[];
  originalUrl?: string | null;
}

function describeMode(
  status: DocumentRow["status"],
  processingMode?: DocumentRow["processing_mode"],
): {
  label: string;
  tone: string;
  modeLabel: string;
  Icon?: typeof CircleAlert;
} {
  switch (status) {
    case "ready":
      return {
        label: "Ready",
        tone: "text-emerald-700",
        modeLabel:
          processingMode === "ai_structured"
            ? "AI-structured"
            : processingMode === "extraction_only"
              ? "Per-page extraction"
              : "Extracted text",
        Icon: CircleCheckBig,
      };
    case "needs_ocr":
      return {
        label: "Needs OCR",
        tone: "text-amber-700",
        modeLabel: "Mock content (PDF scanned)",
        Icon: CircleAlert,
      };
    case "processing":
      return {
        label: "Processing",
        tone: "text-accent",
        modeLabel: "Working on it",
        Icon: Loader2,
      };
    case "failed":
      return {
        label: "Failed",
        tone: "text-red-700",
        modeLabel: "Could not process",
        Icon: CircleAlert,
      };
    case "queued":
      return {
        label: "Queued",
        tone: "text-ink-muted",
        modeLabel: "Waiting to start",
        Icon: FileText,
      };
    case "ocr_queued":
      return {
        label: "OCR queued",
        tone: "text-amber-700",
        modeLabel: "OCR pipeline (beta)",
        Icon: FileText,
      };
    case "ocr_processing":
      return {
        label: "OCR running",
        tone: "text-amber-700",
        modeLabel: "OCR pipeline (beta)",
        Icon: Loader2,
      };
    case "ocr_ready":
      return {
        label: "OCR ready",
        tone: "text-emerald-700",
        modeLabel: "OCR completed",
        Icon: CircleCheckBig,
      };
    case "ocr_failed":
      return {
        label: "OCR failed",
        tone: "text-red-700",
        modeLabel: "OCR error",
        Icon: CircleAlert,
      };
    case "chandra_queued":
      return {
        label: "Chandra queued",
        tone: "text-amber-700",
        modeLabel: "Chandra (beta)",
        Icon: FileText,
      };
    case "chandra_processing":
      return {
        label: "Chandra running",
        tone: "text-amber-700",
        modeLabel: "Chandra (beta)",
        Icon: Loader2,
      };
    case "chandra_ready":
      return {
        label: "Chandra ready",
        tone: "text-emerald-700",
        modeLabel: "Chandra (beta)",
        Icon: CircleCheckBig,
      };
    case "chandra_failed":
      return {
        label: "Chandra failed",
        tone: "text-red-700",
        modeLabel: "Chandra error",
        Icon: CircleAlert,
      };
    default:
      return {
        label: "Uploaded",
        tone: "text-ink-muted",
        modeLabel: "Pending",
        Icon: FileText,
      };
  }
}

function annotationToNote(a: AnnotationRow): Note {
  const meta = (a.meta ?? {}) as Record<string, unknown>;
  const color: HighlightColor | undefined = isHighlightColor(meta.color)
    ? meta.color
    : undefined;
  const style: "highlight" | "underline" | undefined =
    meta.style === "underline"
      ? "underline"
      : meta.style === "highlight"
        ? "highlight"
        : undefined;
  return {
    id: a.kind === "highlight" && a.inline_id ? a.inline_id : a.id,
    kind: a.kind,
    sectionId: a.section_key,
    text: a.text,
    createdAt: new Date(a.created_at).getTime(),
    meta: {
      page: a.page ?? undefined,
      term: typeof meta.term === "string" ? meta.term : undefined,
      topic: typeof meta.topic === "string" ? meta.topic : undefined,
      color,
      style,
    },
  };
}

export function DocumentClient({
  document,
  pages,
  initialAnnotations,
  originalUrl,
}: Props) {
  const router = useRouter();
  const sortedPages = useMemo(
    () =>
      [...pages].sort((a, b) => a.section_index - b.section_index),
    [pages],
  );
  const sections = useMemo(
    () => sortedPages.map(pageRowToSection),
    [sortedPages],
  );
  const [annotations, setAnnotations] =
    useState<AnnotationRow[]>(initialAnnotations);
  const [mode, setMode] = useState<ViewMode>("after");
  const [activeId, setActiveId] = useState<string>(
    sections[0]?.id ?? "",
  );
  const [mobileSheet, setMobileSheet] = useState<"toc" | "notes" | null>(null);
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [restructuringAi, startRestructureAi] = useTransition();
  const [restructuringPlain, startRestructurePlain] = useTransition();
  const [chandraRunning, startChandra] = useTransition();
  const [restructureError, setRestructureError] = useState<string | null>(null);
  const [restructureInfo, setRestructureInfo] = useState<string | null>(null);
  // session-only; do not persist (no localStorage, no cookies)
  const [aiSettings, setAiSettings] = useState<AiSettingsValue>(() =>
    aiSettingsDefault(),
  );
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const notesInputRef = useRef<HTMLTextAreaElement>(null);
  const activeAnnotationTimer = useRef<number | null>(null);

  // pending toggles to swallow rapid double-clicks
  const pendingToggles = useRef<Set<string>>(new Set());

  const notes = useMemo(
    () => annotations.map(annotationToNote),
    [annotations],
  );

  const activeIndex = useMemo(
    () => sections.findIndex((s) => s.id === activeId),
    [sections, activeId],
  );
  const activeSection = sections[activeIndex] ?? sections[0];

  const activeHighlights = useMemo(() => {
    if (!activeSection) return new Set<string>();
    return new Set(
      annotations
        .filter(
          (a) =>
            a.kind === "highlight" &&
            a.section_key === activeSection.id &&
            a.inline_id,
        )
        .map((a) => a.inline_id as string),
    );
  }, [annotations, activeSection]);

  // selection-based annotations rendered as overlay marks on text-only paragraphs
  const userMarks = useMemo<RenderableMark[]>(() => {
    if (!activeSection) return [];
    const out: RenderableMark[] = [];
    for (const a of annotations) {
      if (a.section_key !== activeSection.id) continue;
      const m = (a.meta ?? {}) as Record<string, unknown>;
      const pid = typeof m.paragraphId === "string" ? m.paragraphId : null;
      const startOffset =
        typeof m.startOffset === "number" ? m.startOffset : null;
      const endOffset = typeof m.endOffset === "number" ? m.endOffset : null;
      if (pid === null || startOffset === null || endOffset === null) continue;
      const color: HighlightColor = isHighlightColor(m.color) ? m.color : "yellow";
      const style: "highlight" | "underline" =
        m.style === "underline" ? "underline" : "highlight";
      out.push({
        id: a.id,
        paragraphId: pid,
        startOffset,
        endOffset,
        color,
        style,
      });
    }
    return out;
  }, [annotations, activeSection]);

  const handleCreateSelectionAnnotation = useCallback(
    async (payload: SelectionPayload) => {
      if (!activeSection) return;
      const optimisticId = `tmp-sel-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      const meta = {
        color: payload.color,
        style: payload.style,
        paragraphId: payload.paragraphId,
        startOffset: payload.startOffset,
        endOffset: payload.endOffset,
      };
      const optimistic: AnnotationRow = {
        id: optimisticId,
        user_id: document.user_id,
        document_id: document.id,
        section_key: activeSection.id,
        kind: payload.kind,
        text: payload.text,
        inline_id: null,
        page: payload.page ?? null,
        meta,
        created_at: new Date().toISOString(),
      };
      setAnnotations((prev) => [optimistic, ...prev]);

      const res = await createAnnotation({
        documentId: document.id,
        sectionKey: activeSection.id,
        kind: payload.kind,
        text: payload.text,
        page: payload.page,
        meta,
      });

      if ("error" in res) {
        setAnnotations((prev) => prev.filter((a) => a.id !== optimisticId));
        return;
      }
      setAnnotations((prev) => [
        res.data,
        ...prev.filter((a) => a.id !== optimisticId),
      ]);
      if (payload.kind === "note") {
        // focus the panel input so the user can add a follow-up note
        setTimeout(() => notesInputRef.current?.focus(), 30);
        if (
          typeof window !== "undefined" &&
          window.matchMedia("(max-width: 1279px)").matches
        ) {
          setMobileSheet("notes");
        }
      }
    },
    [activeSection, document.id, document.user_id],
  );

  const handleToggleParagraphHidden = useCallback(
    async (paragraphId: string, hidden: boolean) => {
      if (!activeSection) return;
      const res = await setParagraphMeta({
        documentId: document.id,
        sectionKey: activeSection.id,
        paragraphId,
        updates: { hidden },
      });
      if ("ok" in res) {
        router.refresh();
      }
    },
    [activeSection, document.id, router],
  );

  const handleSelectAnnotation = useCallback((annotationId: string) => {
    setActiveAnnotationId(annotationId);
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1279px)").matches
    ) {
      setMobileSheet("notes");
    }
    if (activeAnnotationTimer.current != null) {
      window.clearTimeout(activeAnnotationTimer.current);
    }
    activeAnnotationTimer.current = window.setTimeout(() => {
      setActiveAnnotationId(null);
    }, 2200);
  }, []);

  useEffect(() => {
    return () => {
      if (activeAnnotationTimer.current != null) {
        window.clearTimeout(activeAnnotationTimer.current);
      }
    };
  }, []);

  const toggleHighlight = useCallback(
    async (id: string, text: string, sectionId: string, page?: number) => {
      if (pendingToggles.current.has(id)) return;
      pendingToggles.current.add(id);

      const existing = annotations.find(
        (a) => a.kind === "highlight" && a.inline_id === id,
      );
      const optimisticAddRow: AnnotationRow = {
        id: `tmp-${id}`,
        user_id: document.user_id,
        document_id: document.id,
        section_key: sectionId,
        kind: "highlight",
        text,
        inline_id: id,
        page: page ?? null,
        meta: null,
        created_at: new Date().toISOString(),
      };
      setAnnotations((prev) =>
        existing
          ? prev.filter((a) => a.id !== existing.id)
          : [optimisticAddRow, ...prev],
      );

      const res = await toggleHighlightAnnotation({
        documentId: document.id,
        sectionKey: sectionId,
        inlineId: id,
        text,
        page,
      });

      pendingToggles.current.delete(id);

      if ("error" in res) {
        // revert
        setAnnotations((prev) =>
          existing
            ? [existing, ...prev.filter((a) => a.id !== `tmp-${id}`)]
            : prev.filter((a) => a.id !== `tmp-${id}`),
        );
        return;
      }
      const outcome = res.data;
      if (outcome.kind === "added") {
        const row = outcome.row;
        setAnnotations((prev) => [
          row,
          ...prev.filter((a) => a.id !== `tmp-${id}`),
        ]);
      }
    },
    [annotations, document.id, document.user_id],
  );

  const addNote = useCallback(
    async (sectionId: string, text: string) => {
      const sec = sections.find((s) => s.id === sectionId);
      const page = sec?.pageStart;
      const res = await createAnnotation({
        documentId: document.id,
        sectionKey: sectionId,
        kind: "note",
        text,
        page,
      });
      if ("ok" in res) {
        setAnnotations((prev) => [res.data, ...prev]);
      }
    },
    [document.id, sections],
  );

  const removeNote = useCallback(
    async (noteId: string) => {
      const target =
        annotations.find(
          (a) => a.kind === "highlight" && a.inline_id === noteId,
        ) ?? annotations.find((a) => a.id === noteId);
      if (!target) return;
      const prev = annotations;
      setAnnotations((prev) => prev.filter((a) => a.id !== target.id));
      const res = await deleteAnnotation({
        annotationId: target.id,
        documentId: document.id,
      });
      if ("error" in res) setAnnotations(prev);
    },
    [annotations, document.id],
  );

  function handleDelete() {
    if (!confirm(`Delete "${document.title}"? This cannot be undone.`)) return;
    setDeleteError(null);
    startDelete(async () => {
      const res = await deleteDocument(document.id);
      if ("error" in res) {
        setDeleteError(res.error);
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    });
  }

  function handleRestructureAI() {
    if (
      !confirm(
        "Restructure this document using AI? This uses 1 AI action from your monthly quota and replaces the current sections. Annotations stay in the panel but may lose their in-text highlights.",
      )
    )
      return;
    setRestructureError(null);
    setRestructureInfo(null);
    startRestructureAi(async () => {
      const res = await restructureWithAI(document.id, aiSettings.config);
      if ("error" in res) {
        setRestructureError(res.error);
      } else {
        const fp = res.data.firstPageDetection ?? "none";
        setRestructureInfo(
          `AI restructuring complete. Footnote detection: ${fp}`,
        );
        router.refresh();
      }
    });
  }

  function handleRunChandra() {
    if (
      !confirm(
        "Run Chandra (layout-aware OCR) on this document? Uses 1 Chandra job from your monthly quota and replaces the current sections with Chandra's structured output. Existing document_pages remain intact if Chandra fails.",
      )
    )
      return;
    setRestructureError(null);
    setRestructureInfo(null);
    startChandra(async () => {
      const res = await runChandraForDocument(document.id);
      if ("error" in res) {
        setRestructureError(res.error);
      } else {
        setRestructureInfo(
          `Chandra completed: ${res.data.pageCount} pages processed.`,
        );
        router.refresh();
      }
    });
  }

  function handleRestructurePlain() {
    if (
      !confirm(
        "Re-run heuristic structuring on this document? This replaces the current sections — annotations stay in the panel but may lose their in-text highlights. No AI quota is used.",
      )
    )
      return;
    setRestructureError(null);
    setRestructureInfo(null);
    startRestructurePlain(async () => {
      const res = await restructureWithoutAI(document.id);
      if ("error" in res) {
        setRestructureError(res.error);
      } else {
        const fp = res.data.firstPageDetection ?? "none";
        const lead = res.data.headingsDetected
          ? "Restructured into semantic sections."
          : "No strong headings detected, using page-based sections.";
        setRestructureInfo(`${lead} Footnote detection: ${fp}`);
        router.refresh();
      }
    });
  }

  // Status-first guard: needs_ocr documents must NEVER render document_pages,
  // even if legacy synthetic rows exist from the pre-2026-05-23 pipeline (when
  // runBasicPdfProcessing used to seed buildSyntheticPages for scanned PDFs).
  // We intentionally do NOT delete those legacy rows — the user's annotations
  // (if any) reference them, and deleting would be unexpected destructive
  // behavior. Hiding them is the right call until the user explicitly
  // restructures or re-uploads.
  if (document.status === "needs_ocr" || sections.length === 0) {
    const isNeedsOcr = document.status === "needs_ocr";
    return (
      <div className="min-h-screen bg-paper-sunken text-ink grid place-items-center px-4">
        <div className="max-w-md w-full rounded-2xl border border-line bg-paper p-6 text-center shadow-lift">
          <div
            className={cn(
              "h-10 w-10 rounded-full grid place-items-center mx-auto",
              isNeedsOcr ? "bg-amber-100" : "bg-paper-sunken",
            )}
          >
            <CircleAlert
              className={cn(
                "h-5 w-5",
                isNeedsOcr ? "text-amber-700" : "text-accent",
              )}
            />
          </div>
          <h1 className="mt-3 font-serif text-[22px] tracking-tightish">
            {isNeedsOcr
              ? "OCR is required for this PDF"
              : document.status === "ready"
                ? "No content"
                : "Not ready yet"}
          </h1>
          <p className="mt-2 text-[13.5px] text-ink-muted leading-relaxed">
            {isNeedsOcr
              ? "This PDF appears to be scanned or image-based. Text extraction is not available yet. OCR is required."
              : document.status === "failed"
                ? document.error ?? "Processing failed."
                : "This document is still being processed. Refresh in a moment."}
          </p>
          <div className="mt-5 flex flex-col items-center gap-2">
            {isNeedsOcr && originalUrl && (
              <a
                href={originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-ink text-paper text-[13px] font-medium hover:bg-ink/90 transition-colors no-tap-highlight"
              >
                <FileText className="h-3.5 w-3.5" />
                View original scan
              </a>
            )}
            {isNeedsOcr && (
              <div className="mt-2 flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={handleRunChandra}
                  disabled={chandraRunning}
                  title="Run Chandra (layout-aware OCR) on this scanned PDF (1 Chandra job)"
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-amber-300 bg-amber-50 text-[12px] font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60 transition-colors no-tap-highlight"
                >
                  {chandraRunning ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Scan className="h-3.5 w-3.5" />
                  )}
                  {chandraRunning
                    ? "Chandra running…"
                    : "Run OCR with Chandra"}
                  <span className="text-2xs uppercase tracking-eyebrow text-amber-700/80 ml-1">
                    beta
                  </span>
                </button>
                {restructureError && (
                  <p className="max-w-[40ch] text-[12px] text-red-700 mt-1">
                    {restructureError}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    disabled
                    title="OCR is required before structuring."
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-line bg-paper text-[12px] font-medium text-ink-faint cursor-not-allowed opacity-70 no-tap-highlight"
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    Restructure
                  </button>
                  <button
                    type="button"
                    disabled
                    title="OCR is required before structuring."
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-line bg-paper text-[12px] font-medium text-ink-faint cursor-not-allowed opacity-70 no-tap-highlight"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Restructure with AI
                  </button>
                </div>
              </div>
            )}
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 mt-1 text-[13px] text-ink-muted hover:text-ink transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to dashboard
            </Link>
          </div>
          {isNeedsOcr && (
            <p className="mt-4 text-2xs uppercase tracking-eyebrow text-ink-faint">
              OCR support is coming soon
            </p>
          )}
        </div>
      </div>
    );
  }

  // needs_ocr is handled by the early-return guard above — nothing below renders for it.
  const isReady = document.status === "ready";
  const isAiStructured = document.processing_mode === "ai_structured";
  const modeMeta = describeMode(document.status, document.processing_mode);
  const pageCount = document.page_count ?? sortedPages.length;
  const restructuring = restructuringAi || restructuringPlain || chandraRunning;
  // Detect the heuristic's page-fallback shape — every section uses the
  // `page-N` section_key. Same shape applies to legacy extraction_only docs.
  const isPageFallback = useMemo(
    () =>
      sortedPages.length > 0 &&
      sortedPages.every((p) => /^page-\d+$/.test(p.section_key)),
    [sortedPages],
  );
  // processing_mode === null means migration 0006 hasn't been applied yet,
  // or the document predates the column. Surface clearly so the user knows.
  const processingModeLabel: string =
    document.processing_mode === "ai_structured"
      ? "ai_structured"
      : document.processing_mode === "structured"
        ? "structured"
        : document.processing_mode === "extraction_only"
          ? "extraction_only"
          : "unknown · run migration 0006";

  return (
    <div className="min-h-screen bg-paper-sunken text-ink">
      <header className="border-b border-line bg-paper">
        <div className="max-w-page mx-auto px-3 sm:px-6 lg:px-8 py-2.5 flex items-start sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <Link
              href="/dashboard"
              className="mt-0.5 sm:mt-0 inline-flex items-center gap-1 text-[12.5px] text-ink-muted hover:text-ink no-tap-highlight shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Library</span>
            </Link>
            <span className="hidden sm:inline text-line-strong">·</span>
            <div className="min-w-0">
              <div
                className="font-serif text-[15px] tracking-tightish truncate max-w-[44ch]"
                title={document.title}
              >
                {document.title}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] uppercase tracking-eyebrow text-ink-faint">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 font-medium",
                    modeMeta.tone,
                  )}
                >
                  {modeMeta.Icon && (
                    <modeMeta.Icon
                      className={cn(
                        "h-2.5 w-2.5",
                        document.status === "processing" && "animate-spin",
                      )}
                    />
                  )}
                  {modeMeta.label}
                </span>
                <span className="text-line-strong">·</span>
                <span className="tabular-nums">
                  {pageCount} {pageCount === 1 ? "page" : "pages"}
                </span>
                <span className="text-line-strong">·</span>
                <span>{modeMeta.modeLabel}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ViewToggle mode={mode} setMode={setMode} />
            <button
              onClick={handleDelete}
              disabled={deleting}
              title="Delete document"
              className="h-8 w-8 grid place-items-center rounded-md text-ink-faint hover:text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors no-tap-highlight"
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
        {deleteError && (
          <div className="max-w-page mx-auto px-3 sm:px-6 lg:px-8 pb-2 text-[12px] text-red-700">
            {deleteError}
          </div>
        )}
      </header>

      {isReady && (
        <div className="border-b border-line bg-paper">
          <div className="max-w-page mx-auto px-3 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center gap-2 sm:gap-3">
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-paper-sunken text-ink-muted px-2 py-0.5 text-[10.5px] uppercase tracking-eyebrow"
              title="Current processing_mode value from the documents table"
            >
              <span className="text-ink-faint">mode</span>
              <span className="font-mono text-ink tracking-normal normal-case">
                {processingModeLabel}
              </span>
            </span>
            <AiSettingsButton value={aiSettings} onChange={setAiSettings} />
            <button
              type="button"
              onClick={handleRestructurePlain}
              disabled={restructuring}
              title="Re-run paragraphizer + heuristic structuring (no AI quota)"
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-line bg-paper text-[12px] font-medium text-ink-muted hover:text-ink hover:border-accent/50 hover:bg-paper-raised disabled:opacity-60 transition-colors no-tap-highlight"
            >
              {restructuringPlain ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
              ) : (
                <Wand2 className="h-3.5 w-3.5 text-accent" />
              )}
              <span>
                {restructuringPlain ? "Restructuring…" : "Restructure"}
              </span>
            </button>
            {!isAiStructured && (
              <button
                type="button"
                onClick={handleRestructureAI}
                disabled={restructuring}
                title="Use AI to add section titles, summaries, and key terms (1 AI action)"
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-line bg-paper text-[12px] font-medium text-ink-muted hover:text-ink hover:border-accent/50 hover:bg-paper-raised disabled:opacity-60 transition-colors no-tap-highlight"
              >
                {restructuringAi ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                )}
                <span>
                  {restructuringAi ? "AI restructuring…" : "Restructure with AI"}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={handleRunChandra}
              disabled={restructuring}
              title="Use Chandra (layout-aware OCR) to re-parse the PDF with proper tables, headings, and reading order (1 Chandra job)"
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-amber-300 bg-amber-50/60 text-[12px] font-medium text-amber-800 hover:bg-amber-50 hover:border-amber-400 disabled:opacity-60 transition-colors no-tap-highlight"
            >
              {chandraRunning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Scan className="h-3.5 w-3.5" />
              )}
              <span>
                {chandraRunning
                  ? "Chandra running…"
                  : "Improve layout with Chandra"}
                <span className="ml-1 text-2xs uppercase tracking-eyebrow text-amber-700/80">
                  beta
                </span>
              </span>
            </button>
            {restructureError && (
              <span className="text-[12px] text-amber-800 truncate max-w-[40ch]">
                {restructureError}
              </span>
            )}
            {!restructureError && restructureInfo && (
              <span className="text-[12px] text-emerald-700 truncate max-w-[40ch]">
                {restructureInfo}
              </span>
            )}
          </div>
        </div>
      )}

      {isReady && isPageFallback && !restructuring && (
        <div className="border-b border-amber-200 bg-amber-50/60">
          <div className="max-w-page mx-auto px-3 sm:px-6 lg:px-8 py-2 flex items-start gap-2.5 text-[12.5px] text-amber-900">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-700" />
            <div className="flex-1">
              <span className="font-medium">
                No strong headings detected, using page-based sections.
              </span>{" "}
              {document.processing_mode === "ai_structured"
                ? null
                : "Click Restructure to retry the heuristic, or Restructure with AI to generate section titles, summaries, and key terms."}
            </div>
          </div>
        </div>
      )}

      {/*
        Removed the legacy "showing demo content as a placeholder" banner —
        needs_ocr documents now always early-return to the dedicated OCR-required
        panel above, so this banner is unreachable and the language ("placeholder")
        was misleading. See feedback-content-authenticity memory.
      */}

      {isReady && (
        <div className="border-b border-line bg-paper-raised">
          <div className="max-w-page mx-auto px-3 sm:px-6 lg:px-8 py-2 flex items-start gap-2.5 text-[12px] text-ink-muted">
            {isAiStructured ? (
              <>
                <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-accent" />
                <div className="flex-1">
                  AI-structured study page. Check original PDF for citation accuracy.
                </div>
              </>
            ) : (
              <>
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-accent" />
                <div className="flex-1">
                  Extracted from uploaded PDF. Check original for citation accuracy.
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <main className="max-w-page mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="rounded-2xl border border-line bg-paper shadow-lift overflow-hidden">
          <div className="flex items-stretch min-h-[640px] lg:min-h-[760px]">
            <Sidebar
              activeId={activeId}
              setActiveId={setActiveId}
              notes={notes}
              sections={sections}
            />

            <section className="flex-1 min-w-0 bg-paper-sunken/30 px-3 sm:px-6 lg:px-10 py-6 sm:py-10 overflow-x-hidden">
              <div key={`${mode}-${activeId}`} className="animate-fade-in">
                {mode === "before" && <ScanView section={activeSection} />}
                {mode === "after" && (
                  <ReadingView
                    section={activeSection}
                    activeHighlights={activeHighlights}
                    toggleHighlight={toggleHighlight}
                    sectionIndex={activeIndex}
                    onViewOriginal={() => setMode("split")}
                    userMarks={userMarks}
                    onCreateSelectionAnnotation={handleCreateSelectionAnnotation}
                    onSelectAnnotation={handleSelectAnnotation}
                    activeAnnotationId={activeAnnotationId}
                    onToggleParagraphHidden={handleToggleParagraphHidden}
                    aiProviderConfig={aiSettings.config}
                    documentId={document.id}
                  />
                )}
                {mode === "split" && (
                  <SplitView
                    section={activeSection}
                    activeHighlights={activeHighlights}
                    toggleHighlight={toggleHighlight}
                    sectionIndex={activeIndex}
                    aiProviderConfig={aiSettings.config}
                    documentId={document.id}
                  />
                )}
              </div>
            </section>

            <NotesPanel
              notes={notes}
              removeNote={removeNote}
              addNote={addNote}
              activeSectionId={activeId}
              sections={sections}
              draftInputRef={notesInputRef}
              activeAnnotationId={activeAnnotationId}
            />
          </div>
        </div>
      </main>

      <MobileBottomBar
        onOpenToc={() => setMobileSheet("toc")}
        onOpenNotes={() => setMobileSheet("notes")}
        noteCount={notes.length}
        sectionTitle={activeSection.title}
        sectionIndex={activeIndex}
        totalSections={sections.length}
      />

      <Drawer
        open={mobileSheet === "toc"}
        onClose={() => setMobileSheet(null)}
        side="left"
        title="Contents"
      >
        <Sidebar
          activeId={activeId}
          setActiveId={setActiveId}
          notes={notes}
          sections={sections}
          variant="drawer"
          onSelect={() => setMobileSheet(null)}
        />
      </Drawer>

      <Drawer
        open={mobileSheet === "notes"}
        onClose={() => setMobileSheet(null)}
        side="right"
        title="Study Notes"
      >
        <NotesPanel
          notes={notes}
          removeNote={removeNote}
          addNote={addNote}
          activeSectionId={activeId}
          variant="drawer"
          sections={sections}
          draftInputRef={notesInputRef}
          activeAnnotationId={activeAnnotationId}
        />
      </Drawer>
    </div>
  );
}
