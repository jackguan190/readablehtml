"use client";

import { ArrowRight, FileText, Sparkles, Eye, Type } from "lucide-react";
import type { Section } from "@/lib/content";
import { ScanView } from "./ScanView";
import { ReadingView } from "./ReadingView";

interface Props {
  section: Section;
  activeHighlights: Set<string>;
  toggleHighlight: (id: string, text: string, sectionId: string, page?: number) => void;
  sectionIndex?: number;
}

export function SplitView({
  section,
  activeHighlights,
  toggleHighlight,
  sectionIndex,
}: Props) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 xl:gap-10 relative">
      <div className="hidden xl:flex absolute left-1/2 top-12 -translate-x-1/2 z-10 h-9 w-9 rounded-full bg-paper-raised border border-line shadow-lift items-center justify-center">
        <ArrowRight className="h-4 w-4 text-accent" />
      </div>

      <div>
        <ColumnHeader
          icon={FileText}
          label="Original Scan"
          stats={[
            { label: "Type", value: "Image PDF" },
            { label: "Pages", value: "287" },
            { label: "Legible", value: "~62%", warn: true },
          ]}
        />
        <ScanView section={section} compact />
      </div>

      <div className="relative">
        <ColumnHeader
          icon={Sparkles}
          label="ReadableHTML"
          accent
          stats={[
            { label: "Type", value: "Interactive HTML" },
            { label: "OCR conf.", value: "~94% est.", mock: true },
            { label: "Searchable", value: "Yes", good: true },
          ]}
        />
        <div className="rounded-2xl border border-line bg-paper-raised shadow-soft p-5 sm:p-8">
          <ReadingView
            section={section}
            activeHighlights={activeHighlights}
            toggleHighlight={toggleHighlight}
            compact
            sectionIndex={sectionIndex}
          />
        </div>
        <div className="mt-3 flex items-center justify-between text-2xs text-ink-subtle px-1">
          <span className="inline-flex items-center gap-1.5">
            <Eye className="h-3 w-3" />
            Adjusted for screen reading
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Type className="h-3 w-3" />
            17px · 1.78 line-height
          </span>
        </div>
      </div>
    </div>
  );
}

interface Stat {
  label: string;
  value: string;
  good?: boolean;
  warn?: boolean;
  mock?: boolean;
}

function ColumnHeader({
  icon: Icon,
  label,
  accent = false,
  stats,
}: {
  icon: typeof FileText;
  label: string;
  accent?: boolean;
  stats: Stat[];
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 pb-3 border-b border-line">
      <div className="flex items-center gap-1.5">
        <Icon className={accent ? "h-3.5 w-3.5 text-accent" : "h-3.5 w-3.5 text-ink-muted"} />
        <span className={accent ? "eyebrow text-accent" : "eyebrow"}>
          {label}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-muted ml-auto">
        {stats.map((s, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1"
            title={s.mock ? "Mock OCR confidence — demo only" : undefined}
          >
            <span className="text-ink-faint">{s.label}</span>
            <span
              className={
                s.good
                  ? "font-medium text-good tabular-nums"
                  : s.warn
                    ? "font-medium text-accent tabular-nums"
                    : "font-medium text-ink tabular-nums"
              }
            >
              {s.value}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
