"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Clock,
  Hash,
  FileText,
  ExternalLink,
  NotebookPen,
  Asterisk,
} from "lucide-react";
import { cn, readingMinutes, sectionPageRange, sectionWordCount } from "@/lib/utils";
import type { Section, Paragraph } from "@/lib/content";
import { AnnotationToolbar } from "./AnnotationToolbar";
import {
  captureSelection,
  clearNativeSelection,
  type CapturedSelection,
} from "@/lib/annotations/selection";
import {
  HIGHLIGHT_COLORS,
  type HighlightColor,
  type HighlightStyle,
} from "@/lib/annotations/colors";

export interface RenderableMark {
  id: string;
  paragraphId: string;
  startOffset: number;
  endOffset: number;
  color: HighlightColor;
  style: HighlightStyle;
}

export interface SelectionPayload {
  paragraphId: string;
  text: string;
  startOffset: number;
  endOffset: number;
  page?: number;
  color: HighlightColor;
  style: HighlightStyle;
  kind: "highlight" | "note";
}

interface Props {
  section: Section;
  activeHighlights: Set<string>;
  toggleHighlight: (id: string, text: string, sectionId: string, page?: number) => void;
  compact?: boolean;
  sectionIndex?: number;
  onViewOriginal?: (page?: number) => void;
  userMarks?: RenderableMark[];
  onCreateSelectionAnnotation?: (payload: SelectionPayload) => void;
  onSelectAnnotation?: (annotationId: string) => void;
  activeAnnotationId?: string | null;
}

function isTextOnlyParagraph(p: Paragraph): boolean {
  return p.inline.length >= 1 && p.inline.every((i) => i.type === "text");
}

function paragraphPlainText(p: Paragraph): string {
  return p.inline.map((i) => ("text" in i ? i.text : i.term)).join("");
}

function renderTextWithMarks(
  text: string,
  marks: RenderableMark[],
  onMarkClick: (id: string) => void,
  activeAnnotationId?: string | null,
): React.ReactNode {
  if (marks.length === 0) return text;

  const sorted = [...marks].sort((a, b) => a.startOffset - b.startOffset);
  const safe: RenderableMark[] = [];
  let lastEnd = 0;
  for (const m of sorted) {
    if (
      m.startOffset >= lastEnd &&
      m.endOffset > m.startOffset &&
      m.endOffset <= text.length
    ) {
      safe.push(m);
      lastEnd = m.endOffset;
    }
  }

  if (safe.length === 0) return text;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const m of safe) {
    if (m.startOffset > cursor) {
      parts.push(text.slice(cursor, m.startOffset));
    }
    const palette = HIGHLIGHT_COLORS[m.color];
    const isUnderline = m.style === "underline";
    const isActive = m.id === activeAnnotationId;
    parts.push(
      <mark
        key={m.id}
        data-annotation-id={m.id}
        onClick={(e) => {
          e.stopPropagation();
          onMarkClick(m.id);
        }}
        style={
          isUnderline
            ? {
                background: "transparent",
                borderBottom: `2px solid ${palette.underline}`,
                paddingBottom: "1px",
                color: "inherit",
                boxShadow: isActive
                  ? `0 0 0 2px ${palette.ring}`
                  : undefined,
                borderRadius: 2,
              }
            : {
                background: palette.bg,
                color: "inherit",
                padding: "0.05em 0.05em",
                borderRadius: 2,
                boxShadow: isActive ? `0 0 0 2px ${palette.ring}` : undefined,
              }
        }
        className="cursor-pointer transition-shadow"
      >
        {text.slice(m.startOffset, m.endOffset)}
      </mark>,
    );
    cursor = m.endOffset;
  }
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return <>{parts}</>;
}

function ParagraphView({
  para,
  activeHighlights,
  toggleHighlight,
  sectionId,
  compact,
  onViewOriginal,
  hasHighlight,
  marks,
  onMarkClick,
  activeAnnotationId,
}: {
  para: Paragraph;
  activeHighlights: Set<string>;
  toggleHighlight: (id: string, text: string, sectionId: string, page?: number) => void;
  sectionId: string;
  compact?: boolean;
  onViewOriginal?: (page?: number) => void;
  hasHighlight: boolean;
  marks: RenderableMark[];
  onMarkClick: (id: string) => void;
  activeAnnotationId?: string | null;
}) {
  const textOnly = isTextOnlyParagraph(para);
  const fullText = textOnly ? paragraphPlainText(para) : "";

  return (
    <div className="group relative" data-page={para.page}>
      <div
        className={cn(
          "grid gap-x-4 sm:gap-x-6",
          !compact && "sm:grid-cols-[42px_1fr]",
        )}
      >
        {!compact && (
          <div className="hidden sm:flex flex-col items-end gap-1 select-none">
            {para.page ? (
              <button
                onClick={() => onViewOriginal?.(para.page)}
                title={`View original scan · page ${para.page}`}
                className="page-gutter hover:text-accent transition-colors no-tap-highlight cursor-pointer"
              >
                p. {para.page}
              </button>
            ) : null}
            {onViewOriginal && para.page ? (
              <button
                onClick={() => onViewOriginal(para.page)}
                title={`View original scan · page ${para.page}`}
                className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-0.5 text-[9.5px] uppercase tracking-eyebrow text-ink-faint hover:text-accent no-tap-highlight"
              >
                <FileText className="h-2.5 w-2.5" />
                <span>scan</span>
              </button>
            ) : null}
          </div>
        )}
        <div>
          <p
            data-paragraph-id={textOnly ? para.id : undefined}
            className={cn(para.dropcap && "dropcap")}
          >
            {compact && para.page && (
              <span
                className="page-marker-inline"
                data-skip-offset="true"
                title={`Original page ${para.page}`}
              >
                p. {para.page}
              </span>
            )}
            {!compact && para.page && (
              <span
                className="page-marker-inline sm:hidden"
                data-skip-offset="true"
                title={`Original page ${para.page}`}
              >
                p. {para.page}
              </span>
            )}
            {textOnly
              ? renderTextWithMarks(
                  fullText,
                  marks,
                  onMarkClick,
                  activeAnnotationId,
                )
              : para.inline.map((inline, i) => {
                  if (inline.type === "text")
                    return <span key={i}>{inline.text}</span>;
                  if (inline.type === "term") {
                    return (
                      <span key={i} className="term" title={inline.def}>
                        {inline.term}
                      </span>
                    );
                  }
                  const active = activeHighlights.has(inline.id);
                  return (
                    <span
                      key={i}
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        toggleHighlight(
                          inline.id,
                          inline.text,
                          sectionId,
                          para.page,
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleHighlight(
                            inline.id,
                            inline.text,
                            sectionId,
                            para.page,
                          );
                        }
                      }}
                      className={cn(
                        "highlight-target",
                        active && "highlight-active",
                      )}
                    >
                      {inline.text}
                    </span>
                  );
                })}
          </p>

          {!compact && (
            <div
              className={cn(
                "transition-opacity -mt-2 mb-4 flex items-center gap-3",
                hasHighlight
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100",
              )}
            >
              <button
                type="button"
                disabled
                title="AI features are coming soon"
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-faint cursor-not-allowed no-tap-highlight"
              >
                <Sparkles className="h-3 w-3" />
                Explain paragraph
                <span className="text-2xs uppercase tracking-eyebrow text-accent">
                  · soon
                </span>
              </button>
              {onViewOriginal && para.page && (
                <button
                  onClick={() => onViewOriginal(para.page)}
                  title={`View original scan · page ${para.page}`}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-muted hover:text-accent transition-colors no-tap-highlight"
                >
                  <FileText className="h-3 w-3" />
                  View original scan
                  <span className="text-ink-faint tabular-nums">· p. {para.page}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ReadingView({
  section,
  activeHighlights,
  toggleHighlight,
  compact = false,
  sectionIndex,
  onViewOriginal,
  userMarks = [],
  onCreateSelectionAnnotation,
  onSelectAnnotation,
  activeAnnotationId,
}: Props) {
  const [glossaryOpen, setGlossaryOpen] = useState(true);
  const [footnotesOpen, setFootnotesOpen] = useState<boolean>(
    () => (section.footnotes?.length ?? 0) <= 6,
  );
  const [selection, setSelection] = useState<CapturedSelection>(null);
  const articleRef = useRef<HTMLElement>(null);

  const words = sectionWordCount(section);
  const minutes = readingMinutes(words);
  const range = sectionPageRange(section);

  const highlightedParaIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of section.paragraphs) {
      for (const inl of p.inline) {
        if (inl.type === "highlight" && activeHighlights.has(inl.id)) {
          set.add(p.id);
          break;
        }
      }
    }
    return set;
  }, [section.paragraphs, activeHighlights]);

  const marksByParagraph = useMemo(() => {
    const map = new Map<string, RenderableMark[]>();
    for (const m of userMarks) {
      const arr = map.get(m.paragraphId) ?? [];
      arr.push(m);
      map.set(m.paragraphId, arr);
    }
    return map;
  }, [userMarks]);

  // Mouseup-driven selection capture, only active when annotations are wired.
  useEffect(() => {
    if (!onCreateSelectionAnnotation) return;
    const article = articleRef.current;
    if (!article) return;
    function onMouseUp(e: MouseEvent) {
      // ignore clicks inside the toolbar itself (it lives in a portal at body)
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("[data-annotation-toolbar='true']")) return;
      // capture only if selection is within the article
      const result = captureSelection(article!);
      setSelection(result);
    }
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [onCreateSelectionAnnotation]);

  const pageForParagraph = useCallback(
    (paragraphId: string): number | undefined => {
      return section.paragraphs.find((p) => p.id === paragraphId)?.page;
    },
    [section.paragraphs],
  );

  const handlePickHighlight = useCallback(
    (color: HighlightColor, style: HighlightStyle) => {
      if (!selection || selection.ok !== true) return;
      if (!onCreateSelectionAnnotation) return;
      onCreateSelectionAnnotation({
        paragraphId: selection.paragraphId,
        text: selection.text,
        startOffset: selection.startOffset,
        endOffset: selection.endOffset,
        page: pageForParagraph(selection.paragraphId),
        color,
        style,
        kind: "highlight",
      });
      setSelection(null);
      clearNativeSelection();
    },
    [selection, onCreateSelectionAnnotation, pageForParagraph],
  );

  const handlePickNote = useCallback(
    (color: HighlightColor) => {
      if (!selection || selection.ok !== true) return;
      if (!onCreateSelectionAnnotation) return;
      onCreateSelectionAnnotation({
        paragraphId: selection.paragraphId,
        text: selection.text,
        startOffset: selection.startOffset,
        endOffset: selection.endOffset,
        page: pageForParagraph(selection.paragraphId),
        color,
        style: "highlight",
        kind: "note",
      });
      setSelection(null);
      clearNativeSelection();
    },
    [selection, onCreateSelectionAnnotation, pageForParagraph],
  );

  const handleCloseToolbar = useCallback(() => {
    setSelection(null);
  }, []);

  const handleMarkClick = useCallback(
    (annotationId: string) => {
      onSelectAnnotation?.(annotationId);
    },
    [onSelectAnnotation],
  );

  return (
    <article
      ref={articleRef}
      className={cn("mx-auto w-full", compact ? "max-w-reading" : "max-w-[760px]")}
    >
      <header className={cn("mb-8", !compact && "pl-0 sm:pl-[58px]")}>
        <div className="flex flex-wrap items-center gap-1.5 text-2xs font-medium uppercase tracking-eyebrow text-ink-subtle">
          <BookOpen className="h-3 w-3 text-accent" />
          <span>The Practice of History</span>
          <span className="text-line-strong">·</span>
          {typeof sectionIndex === "number" && (
            <>
              <span>Chapter {sectionIndex + 1}</span>
              <span className="text-line-strong">·</span>
            </>
          )}
          <span className="text-ink-faint">
            pp. {range.start}
            {range.end !== range.start ? `–${range.end}` : ""}
          </span>
        </div>
        <h1
          className={cn(
            "mt-3 font-serif tracking-tightish text-ink leading-[1.1]",
            compact ? "text-2xl sm:text-[28px]" : "text-3xl sm:text-[40px]",
          )}
        >
          {section.title}
        </h1>
        <div className="mt-3 flex items-center gap-3 text-[12px] text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span className="tabular-nums">{minutes} min read</span>
          </span>
          <span className="h-1 w-1 rounded-full bg-line-strong" />
          <span className="inline-flex items-center gap-1">
            <Hash className="h-3 w-3" />
            <span className="tabular-nums">
              {section.paragraphs.length} paragraphs
            </span>
          </span>
          <span className="h-1 w-1 rounded-full bg-line-strong" />
          <span className="tabular-nums">{words.toLocaleString()} words</span>
        </div>
      </header>

      {!compact && section.summary && (
        <div className="mb-10 pl-0 sm:pl-[58px] grid sm:grid-cols-[1fr_auto] gap-3 items-stretch">
          <div className="rounded-xl border border-line bg-paper-raised shadow-soft overflow-hidden">
            <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-line bg-paper-sunken/40">
              <Sparkles className="h-3 w-3 text-accent" />
              <span className="eyebrow">Section Summary</span>
            </div>
            <p className="px-4 py-4 text-[14px] leading-relaxed text-ink-muted">
              {section.summary}
            </p>
          </div>
          {onViewOriginal && (
            <button
              type="button"
              onClick={() => onViewOriginal()}
              title="Open side-by-side original scan"
              className="group hidden sm:flex flex-col items-stretch w-[132px] rounded-xl border border-line bg-paper-raised shadow-soft overflow-hidden hover:border-accent/50 hover:bg-paper transition-all no-tap-highlight text-left"
            >
              <div className="scan-paper relative flex-1 px-2 py-2 overflow-hidden">
                <div className="scan-text text-[6.5px] leading-tight uppercase tracking-eyebrow opacity-70 flex justify-between">
                  <span>Practice of History</span>
                  <span className="tabular-nums">{range.start}</span>
                </div>
                <div className="scan-text mt-1.5 text-[7px] font-semibold uppercase tracking-wider text-center leading-tight">
                  {section.title}
                </div>
                <div className="scan-text mt-1.5 space-y-[2px]" aria-hidden="true">
                  <div className="h-[2px] bg-[#3a2c14]/35 rounded-sm" />
                  <div className="h-[2px] bg-[#3a2c14]/35 rounded-sm w-[95%]" />
                  <div className="h-[2px] bg-[#3a2c14]/35 rounded-sm w-[88%]" />
                  <div className="h-[2px] bg-[#3a2c14]/35 rounded-sm w-[92%]" />
                  <div className="h-[2px] bg-[#3a2c14]/35 rounded-sm w-[60%]" />
                  <div className="h-[2px] bg-transparent" />
                  <div className="h-[2px] bg-[#3a2c14]/35 rounded-sm w-[90%]" />
                  <div className="h-[2px] bg-[#3a2c14]/35 rounded-sm w-[78%]" />
                  <div className="h-[2px] bg-[#3a2c14]/35 rounded-sm w-[55%]" />
                </div>
              </div>
              <div className="px-2.5 py-1.5 border-t border-line bg-paper-raised">
                <div className="text-[9.5px] uppercase tracking-eyebrow text-ink-faint group-hover:text-accent transition-colors">
                  Original scan
                </div>
                <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-ink">
                  <ExternalLink className="h-3 w-3 text-accent" />
                  View pp. {range.start}
                  {range.end !== range.start ? `–${range.end}` : ""}
                </div>
              </div>
            </button>
          )}
        </div>
      )}

      {!compact && section.authorNote && (
        <div className="mb-8 pl-0 sm:pl-[58px]">
          <div className="rounded-xl border border-line bg-paper-raised/60 px-4 py-3 text-[13px] leading-relaxed text-ink-muted">
            <div className="flex items-center gap-1.5 mb-1">
              <Asterisk className="h-3 w-3 text-accent" />
              <span className="eyebrow">Author note</span>
            </div>
            <p className="italic">{section.authorNote}</p>
          </div>
        </div>
      )}

      <div className="prose-reader">
        {section.paragraphs.map((p) => (
          <ParagraphView
            key={p.id}
            para={p}
            activeHighlights={activeHighlights}
            toggleHighlight={toggleHighlight}
            sectionId={section.id}
            compact={compact}
            onViewOriginal={onViewOriginal}
            hasHighlight={highlightedParaIds.has(p.id)}
            marks={marksByParagraph.get(p.id) ?? []}
            onMarkClick={handleMarkClick}
            activeAnnotationId={activeAnnotationId}
          />
        ))}
      </div>

      {!compact && section.footnotes && section.footnotes.length > 0 && (
        <div className="mt-12 pl-0 sm:pl-[58px]">
          <div className="rounded-xl border border-line bg-paper-raised overflow-hidden">
            <button
              onClick={() => setFootnotesOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-paper-sunken/40 transition-colors no-tap-highlight"
            >
              <div className="flex items-center gap-1.5">
                <NotebookPen className="h-3 w-3 text-accent" />
                <span className="eyebrow text-ink">
                  Footnotes · {section.footnotes.length}
                </span>
              </div>
              {footnotesOpen ? (
                <ChevronUp className="h-3.5 w-3.5 text-ink-muted" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-ink-muted" />
              )}
            </button>
            {footnotesOpen && (
              <ol className="px-4 pb-4 pt-1 space-y-2.5 animate-fade-in">
                {section.footnotes.map((f) => (
                  <li
                    id={`fn-${section.id}-${f.number}`}
                    key={`${f.number}-${f.page}`}
                    className="grid grid-cols-[auto_1fr] gap-x-3 text-[12.5px] leading-relaxed text-ink-muted"
                  >
                    <span className="font-serif font-medium text-accent tabular-nums tracking-tightish pt-0.5">
                      {f.number}.
                    </span>
                    <span>
                      {f.text}
                      <span className="ml-2 text-2xs text-ink-faint tabular-nums">
                        · p. {f.page}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}

      {!compact && section.keyTerms.length > 0 && (
        <div className="mt-6 pl-0 sm:pl-[58px]">
          <div className="rounded-xl border border-line bg-paper-raised overflow-hidden">
            <button
              onClick={() => setGlossaryOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-paper-sunken/40 transition-colors no-tap-highlight"
            >
              <div className="flex items-center gap-1.5">
                <BookOpen className="h-3 w-3 text-accent" />
                <span className="eyebrow text-ink">
                  Key Terms · {section.keyTerms.length}
                </span>
              </div>
              {glossaryOpen ? (
                <ChevronUp className="h-3.5 w-3.5 text-ink-muted" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-ink-muted" />
              )}
            </button>
            {glossaryOpen && (
              <dl className="px-4 pb-4 pt-1 grid sm:grid-cols-2 gap-x-6 gap-y-3 animate-fade-in">
                {section.keyTerms.map((kt) => (
                  <div
                    key={kt.term}
                    className="py-1.5 border-l-2 border-accent-soft/60 pl-3"
                  >
                    <dt className="font-serif italic text-[14.5px] text-accent">
                      {kt.term}
                    </dt>
                    <dd className="text-[13px] leading-relaxed text-ink-muted mt-1">
                      {kt.def}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      )}

      {selection?.ok === true && onCreateSelectionAnnotation && (
        <AnnotationToolbar
          variant="single"
          rect={selection.rect}
          onPickHighlight={handlePickHighlight}
          onPickNote={handlePickNote}
          onClose={handleCloseToolbar}
        />
      )}
      {selection?.ok === false && (
        <AnnotationToolbar
          variant="multi"
          rect={selection.rect}
          onClose={handleCloseToolbar}
        />
      )}
    </article>
  );
}
