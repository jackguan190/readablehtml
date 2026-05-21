import { UploadCloud, ScanText, FileCode2, GraduationCap } from "lucide-react";
import { SectionHeader } from "./SectionHeader";

const steps = [
  {
    Icon: UploadCloud,
    label: "Upload PDF",
    desc: "Drag in any scanned academic book or paper.",
  },
  {
    Icon: ScanText,
    label: "OCR + layout detection",
    desc: "We identify pages, headings, paragraphs, and figures.",
  },
  {
    Icon: FileCode2,
    label: "Clean HTML",
    desc: "Rebuilt as a responsive study page with anchors and search.",
  },
  {
    Icon: GraduationCap,
    label: "Study tools",
    desc: "Summaries, glossary, highlights, and notes that persist.",
  },
];

export function HowItWorks() {
  return (
    <section className="max-w-page mx-auto px-4 sm:px-8 py-12 sm:py-16">
      <SectionHeader
        eyebrow="How it works"
        title="Four steps from scan to study."
        subtitle="No special hardware, no plugins. Just upload and read."
      />

      <ol className="mt-8 sm:mt-12 relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div
          className="hidden lg:block absolute top-12 left-[12.5%] right-[12.5%] h-px bg-line"
          aria-hidden="true"
        />
        {steps.map((s, i) => (
          <li
            key={s.label}
            className="relative rounded-xl border border-line bg-paper px-5 py-5 hover:border-accent/40 hover:bg-paper-raised transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="relative h-9 w-9 rounded-full bg-paper-raised border border-line grid place-items-center shadow-soft">
                <s.Icon className="h-4 w-4 text-accent" />
              </div>
              <span className="font-sans text-2xs font-medium tabular-nums tracking-eyebrow text-ink-faint">
                STEP {String(i + 1).padStart(2, "0")}
              </span>
            </div>
            <div className="mt-3 font-serif text-[17px] tracking-tightish text-ink leading-tight">
              {s.label}
            </div>
            <p className="mt-1.5 text-[13px] text-ink-muted leading-relaxed">
              {s.desc}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
