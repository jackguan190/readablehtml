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
  createAnnotation,
  deleteAnnotation,
  toggleHighlightAnnotation,
} from "@/lib/annotations/actions";
import { deleteDocument } from "@/lib/documents/actions";
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
}

function describeMode(status: DocumentRow["status"]): {
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
        modeLabel: "Extracted text",
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

  if (sections.length === 0) {
    return (
      <div className="min-h-screen bg-paper-sunken text-ink grid place-items-center px-4">
        <div className="max-w-md w-full rounded-2xl border border-line bg-paper p-6 text-center shadow-soft">
          <CircleAlert className="h-6 w-6 text-accent mx-auto" />
          <h1 className="mt-2 font-serif text-[20px] tracking-tightish">
            {document.status === "ready" ? "No content" : "Not ready yet"}
          </h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            {document.status === "failed"
              ? document.error ?? "Processing failed."
              : "This document is still being processed. Refresh in a moment."}
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 mt-4 text-[13px] text-accent hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const needsOcr = document.status === "needs_ocr";
  const isReady = document.status === "ready";
  const modeMeta = describeMode(document.status);
  const pageCount = document.page_count ?? sortedPages.length;

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

      {needsOcr && (
        <div className="border-b border-amber-200 bg-amber-50/80">
          <div className="max-w-page mx-auto px-3 sm:px-6 lg:px-8 py-2.5 flex items-start gap-2.5 text-[12.5px] text-amber-900">
            <CircleAlert className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" />
            <div className="flex-1">
              <span className="font-medium">
                This PDF appears scanned.
              </span>{" "}
              OCR is not implemented yet — showing demo content as a placeholder
              so you can still test the reading flow.
            </div>
          </div>
        </div>
      )}

      {isReady && (
        <div className="border-b border-line bg-paper-raised">
          <div className="max-w-page mx-auto px-3 sm:px-6 lg:px-8 py-2 flex items-start gap-2.5 text-[12px] text-ink-muted">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-accent" />
            <div className="flex-1">
              Extracted from uploaded PDF. Check original for citation accuracy.
            </div>
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
                  />
                )}
                {mode === "split" && (
                  <SplitView
                    section={activeSection}
                    activeHighlights={activeHighlights}
                    toggleHighlight={toggleHighlight}
                    sectionIndex={activeIndex}
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
