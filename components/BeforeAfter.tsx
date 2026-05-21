import { ArrowRight, ArrowDown, ScanText, X, Check } from "lucide-react";
import { SectionHeader } from "./SectionHeader";

const PARAGRAPH =
  "Every generation of historians inherits a favored prime mover — the engine behind the engines. For Marx it was the mode of production; for Weber, the disenchanting force of rationalization; for Braudel, the slow grammar of geography and climate.";

const beforeBads = [
  "Can't search the text",
  "Can't cite a passage cleanly",
  "Zoom-and-squint typography",
  "Notes don't stick to the page",
];

const afterGoods = [
  "Selectable, searchable HTML",
  "Stable page anchors for citations",
  "Tuned line-height & measure",
  "Highlights & notes that persist",
];

export function BeforeAfter() {
  return (
    <section className="max-w-page mx-auto px-4 sm:px-8 py-12 sm:py-16">
      <SectionHeader
        eyebrow="Before · After"
        title="See the transformation."
        subtitle="Same paragraph. Same page. Two very different reading experiences."
      />

      <div className="mt-10 sm:mt-12 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-6 md:gap-5 items-stretch">
        {/* BEFORE */}
        <div className="flex flex-col">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-paper-sunken text-ink-muted text-2xs font-medium uppercase tracking-eyebrow">
              <X className="h-3 w-3" />
              Before
            </span>
            <span className="text-2xs text-ink-faint">Original scan · page 7</span>
          </div>

          <div className="scan-paper rounded-md p-5 sm:p-6 shadow-lift overflow-hidden flex-1">
            <div className="relative z-10">
              <div className="scan-text text-[10px] uppercase tracking-eyebrow opacity-70 mb-2 flex justify-between">
                <span>The Practice of History</span>
                <span>7</span>
              </div>
              <p className="scan-text text-[11.5px] leading-snug" style={{ textAlign: "justify", hyphens: "auto" }}>
                {PARAGRAPH}
              </p>
            </div>
          </div>

          <ul className="mt-4 space-y-1.5">
            {beforeBads.map((b) => (
              <li
                key={b}
                className="flex items-start gap-2 text-[13px] text-ink-muted"
              >
                <X className="h-3.5 w-3.5 text-ink-faint mt-0.5 shrink-0" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ARROW */}
        <div className="flex md:flex-col items-center justify-center gap-3 py-2 md:py-0 md:px-1">
          <div className="hidden md:block h-16 w-px bg-line" />
          <div className="h-10 w-10 rounded-full bg-paper-raised border border-line shadow-soft grid place-items-center">
            <ArrowRight className="h-4 w-4 text-accent hidden md:block" />
            <ArrowDown className="h-4 w-4 text-accent md:hidden" />
          </div>
          <div className="hidden md:block">
            <div className="text-2xs uppercase tracking-eyebrow text-ink-faint text-center mt-2">
              OCR + reflow
            </div>
            <div
              className="flex items-center justify-center gap-1 mt-1"
              title="Mock OCR confidence — demo only"
            >
              <ScanText className="h-3 w-3 text-accent" />
              <span className="text-2xs text-ink-muted tabular-nums">~94%</span>
              <span className="text-[9px] uppercase tracking-eyebrow text-ink-faint ml-1">
                est.
              </span>
            </div>
          </div>
          <div className="hidden md:block h-16 w-px bg-line" />
        </div>

        {/* AFTER */}
        <div className="flex flex-col">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/10 text-accent text-2xs font-medium uppercase tracking-eyebrow">
              <Check className="h-3 w-3" />
              After
            </span>
            <span className="text-2xs text-ink-faint">
              ReadableHTML · with anchors
            </span>
          </div>

          <div className="rounded-md p-5 sm:p-6 border border-line bg-paper-raised shadow-soft flex-1">
            <div className="flex items-center gap-2 text-2xs text-accent uppercase tracking-eyebrow mb-2">
              <span className="font-medium">p. 7</span>
              <span className="h-1 w-1 rounded-full bg-line-strong" />
              <span className="text-ink-faint normal-case tracking-normal">
                Problem One · paragraph 1
              </span>
            </div>
            <p className="font-serif text-[14px] leading-[1.7] text-ink">
              {PARAGRAPH}
            </p>
          </div>

          <ul className="mt-4 space-y-1.5">
            {afterGoods.map((g) => (
              <li
                key={g}
                className="flex items-start gap-2 text-[13px] text-ink-muted"
              >
                <Check className="h-3.5 w-3.5 text-accent mt-0.5 shrink-0" />
                <span>{g}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
