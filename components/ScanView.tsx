"use client";

import type { Section } from "@/lib/content";

interface Props {
  section: Section;
  compact?: boolean;
}

function flatText(section: Section): { page?: number; text: string }[] {
  return section.paragraphs.map((p) => ({
    page: p.page,
    text: p.inline.map((i) => ("text" in i ? i.text : i.term)).join(""),
  }));
}

export function ScanView({ section, compact = false }: Props) {
  const paras = flatText(section);

  return (
    <div className="relative">
      <div
        className={`scan-paper scan-skew shadow-lift overflow-hidden border border-[#b39d6f]/40 ${
          compact ? "p-6 sm:p-8" : "p-8 sm:p-14"
        }`}
        style={{ minHeight: compact ? 480 : 760 }}
      >
        <div className="relative z-10 max-w-[58ch] mx-auto">
          <div
            className="scan-text flex items-center justify-between mb-7 pb-2 border-b border-[#3a2c14]/30"
            style={{ fontSize: compact ? 10.5 : 12, letterSpacing: "0.08em" }}
          >
            <span className="uppercase">The Practice of History</span>
            <span className="tabular-nums">{section.pageStart}</span>
          </div>

          <h2
            className="scan-text font-semibold uppercase text-center mb-6"
            style={{
              fontSize: compact ? 14 : 18,
              letterSpacing: "0.2em",
            }}
          >
            {section.title}
          </h2>

          <div
            className="scan-text"
            style={{ fontSize: compact ? 12.5 : 14.5 }}
          >
            {paras.map((p, i) => (
              <p
                key={i}
                className="mb-3"
                style={{ textIndent: i === 0 ? 0 : "1.4em" }}
              >
                {p.text}
              </p>
            ))}
          </div>

          <div
            className="scan-text text-center mt-10 pt-4 border-t border-[#3a2c14]/30"
            style={{ fontSize: compact ? 10.5 : 12 }}
          >
            — {section.pageStart} —
          </div>
        </div>
      </div>
      <div className="absolute -bottom-1.5 -right-1.5 inset-0 -z-10 bg-[#d4c19a]/40 rounded-sm" />
      <div className="absolute -bottom-3 -right-3 inset-0 -z-20 bg-[#d4c19a]/20 rounded-sm" />
    </div>
  );
}
