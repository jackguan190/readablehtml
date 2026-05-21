"use client";

import { List, NotebookText } from "lucide-react";

interface Props {
  onOpenToc: () => void;
  onOpenNotes: () => void;
  noteCount: number;
  sectionTitle: string;
  sectionIndex: number;
  totalSections: number;
}

export function MobileBottomBar({
  onOpenToc,
  onOpenNotes,
  noteCount,
  sectionTitle,
  sectionIndex,
  totalSections,
}: Props) {
  return (
    <div
      className="xl:hidden fixed bottom-0 inset-x-0 z-30 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 pointer-events-none"
      aria-label="Reading toolbar"
    >
      <div className="pointer-events-auto max-w-md mx-auto rounded-2xl border border-line bg-paper/95 backdrop-blur-xl shadow-lift flex items-center gap-1 p-1.5">
        <button
          onClick={onOpenToc}
          className="flex-1 inline-flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-paper-sunken transition-colors no-tap-highlight text-left"
        >
          <List className="h-4 w-4 text-accent shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block text-2xs text-ink-faint tabular-nums">
              {sectionIndex + 1} / {totalSections}
            </span>
            <span className="block text-[12px] font-medium text-ink truncate">
              {sectionTitle}
            </span>
          </span>
        </button>
        <span className="h-8 w-px bg-line" />
        <button
          onClick={onOpenNotes}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-paper-sunken transition-colors no-tap-highlight relative"
          aria-label="Open notes"
        >
          <NotebookText className="h-4 w-4 text-ink-muted" />
          <span className="text-[12px] font-medium text-ink">Notes</span>
          {noteCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-paper text-[10px] font-medium grid place-items-center tabular-nums">
              {noteCount > 99 ? "99+" : noteCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
