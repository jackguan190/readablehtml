"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Highlighter,
  StickyNote,
  Trash2,
  Plus,
  NotebookText,
  Download,
  Quote,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { sections as defaultSections, type Section } from "@/lib/content";
import { HIGHLIGHT_COLORS, type HighlightColor } from "@/lib/annotations/colors";

export type NoteKind = "highlight" | "note" | "quote" | "glossary" | "ai";

export type Note = {
  id: string;
  kind: NoteKind;
  sectionId: string;
  text: string;
  createdAt: number;
  meta?: {
    term?: string;
    page?: number;
    topic?: string;
    color?: HighlightColor;
    style?: "highlight" | "underline";
  };
};

interface Props {
  notes: Note[];
  removeNote: (id: string) => void;
  addNote: (sectionId: string, text: string) => void;
  activeSectionId: string;
  variant?: "desktop" | "drawer";
  sections?: Section[];
  draftInputRef?: React.RefObject<HTMLTextAreaElement>;
  activeAnnotationId?: string | null;
}

function makeSectionTitle(sections: Section[]) {
  return (id: string) => sections.find((s) => s.id === id)?.title ?? id;
}

function makeSectionPageStart(sections: Section[]) {
  return (id: string) => sections.find((s) => s.id === id)?.pageStart;
}

function currentPageForSection(
  notes: Note[],
  sectionId: string,
  pageStartFor: (id: string) => number | undefined,
): number | undefined {
  const recent = [...notes]
    .filter((n) => n.sectionId === sectionId && n.meta?.page)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  return recent?.meta?.page ?? pageStartFor(sectionId);
}

function timeAgo(ms: number) {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

type FilterId = "all" | "current" | "highlights" | "quotes" | "glossary" | "ai";

export function NotesPanel({
  notes,
  removeNote,
  addNote,
  activeSectionId,
  variant = "desktop",
  sections = defaultSections,
  draftInputRef,
  activeAnnotationId,
}: Props) {
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const sectionTitle = useMemo(() => makeSectionTitle(sections), [sections]);
  const sectionPageStart = useMemo(
    () => makeSectionPageStart(sections),
    [sections],
  );
  const listRef = useRef<HTMLDivElement>(null);

  // when an annotation is selected (e.g. by clicking its highlight in the
  // reading view), scroll its card into view inside the panel.
  useEffect(() => {
    if (!activeAnnotationId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-annotation-id="${CSS.escape(activeAnnotationId)}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeAnnotationId]);

  const filtered = useMemo(() => {
    return notes.filter((n) => {
      if (filter === "highlights")
        return n.kind === "highlight" || n.kind === "quote";
      if (filter === "glossary") return n.kind === "glossary";
      if (filter === "ai") return n.kind === "ai";
      if (filter === "quotes") return n.kind === "quote";
      if (filter === "current") return n.sectionId === activeSectionId;
      return true;
    });
  }, [notes, filter, activeSectionId]);

  const grouped = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const n of filtered) {
      const arr = map.get(n.sectionId) ?? [];
      arr.push(n);
      map.set(n.sectionId, arr);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const ai = sections.findIndex((s) => s.id === a[0]);
      const bi = sections.findIndex((s) => s.id === b[0]);
      return ai - bi;
    });
  }, [filtered]);

  const counts = useMemo(() => {
    return {
      all: notes.length,
      highlights: notes.filter(
        (n) => n.kind === "highlight" || n.kind === "quote",
      ).length,
      quotes: notes.filter((n) => n.kind === "quote").length,
      glossary: notes.filter((n) => n.kind === "glossary").length,
      ai: notes.filter((n) => n.kind === "ai").length,
      current: notes.filter((n) => n.sectionId === activeSectionId).length,
    };
  }, [notes, activeSectionId]);

  function handleAdd() {
    const text = draft.trim();
    if (!text) return;
    addNote(activeSectionId, text);
    setDraft("");
  }

  function exportNotes() {
    const lines: string[] = [
      `# ReadableHTML — Study Notes`,
      `Exported ${new Date().toLocaleString()}`,
      "",
    ];
    for (const [sid, arr] of grouped) {
      lines.push(`## ${sectionTitle(sid)}`);
      for (const n of arr) {
        if (n.kind === "highlight") {
          lines.push(`> ${n.text}`);
        } else {
          lines.push(`- ${n.text}`);
        }
      }
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `readablehtml-notes-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filters: { id: FilterId; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "current", label: "Section", count: counts.current },
    { id: "highlights", label: "Marks", count: counts.highlights },
    { id: "glossary", label: "Terms", count: counts.glossary },
    { id: "ai", label: "AI", count: counts.ai },
  ];

  return (
    <aside
      className={cn(
        "flex flex-col bg-paper",
        variant === "desktop"
          ? "hidden xl:flex w-[340px] shrink-0 border-l border-line"
          : "h-full w-full",
      )}
    >
      <div className="px-4 pt-3.5 pb-2.5 border-b border-line">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <NotebookText className="h-3 w-3 text-accent" />
            <span className="eyebrow">Study Workspace</span>
            <span className="tabular-nums text-2xs text-ink-faint">
              · {notes.length}
            </span>
          </div>
          {notes.length > 0 && (
            <button
              onClick={exportNotes}
              className="inline-flex items-center gap-1 text-2xs text-ink-muted hover:text-ink transition-colors no-tap-highlight"
              title="Export as Markdown"
            >
              <Download className="h-3 w-3" />
              Export
            </button>
          )}
        </div>
        <div className="mt-2.5 flex items-center gap-1 no-scrollbar overflow-x-auto -mx-1 px-1">
          {filters.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors no-tap-highlight",
                  active
                    ? "bg-ink text-paper"
                    : "bg-paper-sunken text-ink-muted hover:text-ink",
                )}
              >
                <span>{f.label}</span>
                <span
                  className={cn(
                    "tabular-nums",
                    active ? "text-paper/70" : "text-ink-faint",
                  )}
                >
                  {f.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto scroll-fade px-3 py-3">
        {filtered.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <ul className="space-y-3.5">
            {grouped.map(([sid, arr]) => (
              <li key={sid}>
                <div className="px-1 pb-1.5 flex items-center gap-2">
                  <span className="eyebrow text-accent">
                    {sectionTitle(sid)}
                  </span>
                  <span className="h-px flex-1 bg-line" />
                  <span className="text-2xs text-ink-faint tabular-nums">
                    {arr.length}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {arr.map((n) => (
                    <NoteItem
                      key={n.id}
                      note={n}
                      onRemove={() => removeNote(n.id)}
                      active={n.id === activeAnnotationId}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-line p-2.5 bg-paper-sunken/40">
        <div className="mb-1.5 flex items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1 rounded-full bg-accent/10 text-accent px-2 py-0.5 text-[10.5px] font-medium tabular-nums"
            title="Context for new note"
          >
            <span>p. {currentPageForSection(notes, activeSectionId, sectionPageStart) ?? "—"}</span>
            <span className="text-accent/50">·</span>
            <span className="truncate max-w-[160px] normal-case">
              {sectionTitle(activeSectionId)}
            </span>
          </span>
        </div>
        <div className="rounded-xl border border-line bg-paper-raised overflow-hidden focus-within:border-accent/50 focus-within:shadow-soft transition-all">
          <textarea
            ref={draftInputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="Add a note about this passage..."
            rows={2}
            className="w-full resize-none bg-transparent px-3 py-2 text-[13px] leading-relaxed text-ink placeholder:text-ink-subtle outline-none"
          />
          <div className="flex items-center justify-between px-2 py-1.5 border-t border-line">
            <span className="text-2xs text-ink-subtle pl-1">
              <kbd className="font-sans text-[9.5px] px-1 py-px rounded bg-paper-sunken border border-line">
                ⌘⏎
              </kbd>{" "}
              to save
            </span>
            <button
              onClick={handleAdd}
              disabled={!draft.trim()}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors no-tap-highlight",
                draft.trim()
                  ? "bg-ink text-paper hover:bg-ink/90"
                  : "bg-paper-sunken text-ink-faint cursor-not-allowed",
              )}
            >
              <Plus className="h-3 w-3" />
              Save note
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function kindMeta(kind: NoteKind) {
  switch (kind) {
    case "highlight":
      return { Icon: Highlighter, label: "Highlight", tone: "text-accent" };
    case "quote":
      return { Icon: Quote, label: "Quote", tone: "text-accent" };
    case "glossary":
      return { Icon: BookOpen, label: "Glossary", tone: "text-ink-muted" };
    case "ai":
      return { Icon: Sparkles, label: "AI Explain", tone: "text-accent" };
    default:
      return { Icon: StickyNote, label: "Note", tone: "text-ink-muted" };
  }
}

function NoteItem({
  note,
  onRemove,
  active,
}: {
  note: Note;
  onRemove: () => void;
  active?: boolean;
}) {
  const meta = kindMeta(note.kind);
  const Icon = meta.Icon;
  const page = note.meta?.page;
  const palette = note.meta?.color
    ? HIGHLIGHT_COLORS[note.meta.color]
    : null;
  const isUnderline = note.meta?.style === "underline";
  const accentStripeStyle = palette
    ? isUnderline
      ? { borderColor: palette.underline }
      : { borderColor: palette.ring, backgroundColor: palette.bg }
    : undefined;

  return (
    <li
      data-annotation-id={note.id}
      className={cn(
        "group rounded-lg border bg-paper-raised px-2.5 py-2 transition-all hover:border-accent/40",
        active
          ? "border-accent ring-2 ring-accent/20"
          : "border-line",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn("inline-flex items-center gap-1 text-2xs", meta.tone)}>
          {palette ? (
            <span
              className="h-2.5 w-2.5 rounded-full border"
              style={{
                backgroundColor: palette.swatch,
                borderColor: palette.ring,
              }}
              aria-hidden="true"
            />
          ) : (
            <Icon className="h-2.5 w-2.5" />
          )}
          <span className="uppercase tracking-eyebrow font-medium">
            {isUnderline && note.kind === "highlight" ? "Underline" : meta.label}
          </span>
          {page != null && (
            <span className="text-ink-faint tabular-nums normal-case tracking-normal">
              · p. {page}
            </span>
          )}
        </span>
        <button
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-ink transition-opacity no-tap-highlight"
          aria-label={`Remove ${meta.label}`}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {palette && (note.kind === "highlight" || note.kind === "note") ? (
        <p
          className={cn(
            "font-serif text-[12.5px] leading-snug text-ink mt-1.5 italic relative pl-2.5",
            isUnderline ? "border-l-2" : "border-l-2",
          )}
          style={accentStripeStyle}
        >
          {note.text}
        </p>
      ) : note.kind === "highlight" || note.kind === "quote" ? (
        <p className="font-serif text-[12.5px] leading-snug text-ink mt-1.5 italic relative pl-2.5 border-l-2 border-accent/40">
          {note.text}
        </p>
      ) : note.kind === "glossary" ? (
        <div className="mt-1.5 pl-2.5 border-l-2 border-accent-soft/60">
          <div className="font-serif italic text-[13px] text-accent">
            {note.meta?.term ?? "term"}
          </div>
          <p className="text-[12.5px] leading-snug text-ink-muted mt-0.5">
            {note.text}
          </p>
        </div>
      ) : note.kind === "ai" ? (
        <div className="mt-1.5">
          {note.meta?.topic && (
            <div className="text-[11px] text-ink-muted leading-snug italic">
              “{note.meta.topic}”
            </div>
          )}
          <p className="text-[12.5px] leading-snug text-ink mt-1">
            {note.text}
          </p>
        </div>
      ) : (
        <p className="text-[12.5px] leading-snug text-ink mt-1.5 whitespace-pre-wrap">
          {note.text}
        </p>
      )}
      <p className="text-2xs text-ink-faint mt-1.5 tabular-nums">
        {timeAgo(note.createdAt)}
      </p>
    </li>
  );
}

function EmptyState({ filter }: { filter: FilterId }) {
  const copy: Record<FilterId, { icon: typeof Highlighter; title: string; body: string }> = {
    all: {
      icon: NotebookText,
      title: "No notes yet",
      body: "Click any underlined sentence to highlight, or save a glossary term, quote, or AI explanation.",
    },
    highlights: {
      icon: Highlighter,
      title: "No marks yet",
      body: "Click any underlined sentence in the reading view to mark a passage.",
    },
    quotes: {
      icon: Quote,
      title: "No quotes saved",
      body: "Long-press a passage and choose Save as quote.",
    },
    glossary: {
      icon: BookOpen,
      title: "No saved terms",
      body: "Tap a glossary term in the text or in the Key Terms list to pin it here.",
    },
    ai: {
      icon: Sparkles,
      title: "AI explanations · coming soon",
      body: "AI features aren't enabled yet on the alpha. Once they ship, saved explanations will live here.",
    },
    current: {
      icon: NotebookText,
      title: "Nothing in this section",
      body: "Marks, quotes, glossary, and AI explanations from this section will appear here.",
    },
  };
  const C = copy[filter];
  return (
    <div className="flex flex-col items-center text-center px-4 py-6">
      <div className="h-9 w-9 rounded-full bg-paper-sunken grid place-items-center mb-2.5">
        <C.icon className="h-4 w-4 text-ink-subtle" />
      </div>
      <h3 className="font-serif text-[14.5px] text-ink">{C.title}</h3>
      <p className="mt-1 text-[12px] text-ink-muted leading-relaxed max-w-[30ch]">
        {C.body}
      </p>
    </div>
  );
}
