import { SearchX, Quote, Eye, NotebookPen } from "lucide-react";
import { SectionHeader } from "./SectionHeader";

const points = [
  {
    Icon: SearchX,
    title: "Hard to search",
    desc: "Scanned text isn't selectable. Ctrl-F finds nothing across a 300-page book.",
  },
  {
    Icon: Quote,
    title: "Hard to cite",
    desc: "Page numbers are baked into the image. No deep links to specific passages.",
  },
  {
    Icon: Eye,
    title: "Bad readability",
    desc: "Skewed scans, narrow margins, small type. Zoom-and-squint is the only option.",
  },
  {
    Icon: NotebookPen,
    title: "No study workflow",
    desc: "Highlights and notes don't stick to the text. Glossary terms aren't linked.",
  },
];

export function PainPoints() {
  return (
    <section className="max-w-page mx-auto px-4 sm:px-8 py-12 sm:py-16">
      <SectionHeader
        eyebrow="The problem"
        title="Reading academic PDFs is broken."
        subtitle="If you've ever fought a scanned chapter the night before a seminar, these four pain points are why."
      />
      <ul className="mt-8 sm:mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {points.map((p) => (
          <li
            key={p.title}
            className="rounded-xl border border-line bg-paper px-4 py-4 hover:border-line-strong hover:bg-paper-raised transition-colors"
          >
            <div className="h-9 w-9 rounded-lg bg-paper-sunken grid place-items-center mb-3">
              <p.Icon className="h-4 w-4 text-ink-muted" />
            </div>
            <div className="font-serif text-[16px] tracking-tightish text-ink leading-tight">
              {p.title}
            </div>
            <p className="mt-1.5 text-[13px] text-ink-muted leading-relaxed">
              {p.desc}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
