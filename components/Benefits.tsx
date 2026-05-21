import {
  FileCode2,
  Hash,
  ListChecks,
  BookMarked,
  Highlighter,
  Columns2,
} from "lucide-react";
import { SectionHeader } from "./SectionHeader";

const benefits = [
  {
    Icon: FileCode2,
    title: "Readable HTML",
    desc: "Clean type, generous measure, and tuned line-height. Built for the way screens actually display text.",
  },
  {
    Icon: Hash,
    title: "Page anchors",
    desc: "Every original page number becomes a stable anchor — citable, shareable, and link-deep.",
  },
  {
    Icon: ListChecks,
    title: "Section summaries",
    desc: "A short summary card at the top of every section so you can orient before you read.",
  },
  {
    Icon: BookMarked,
    title: "Glossary terms",
    desc: "Key terms are inline-linked. Hover for a definition; never lose the thread of a hard sentence.",
  },
  {
    Icon: Highlighter,
    title: "Notes & highlights",
    desc: "Click any sentence to highlight. Free-form notes persist locally and export as Markdown.",
  },
  {
    Icon: Columns2,
    title: "Original comparison",
    desc: "Toggle the original scan side-by-side at any time. The source of truth is one click away.",
  },
];

export function Benefits() {
  return (
    <section className="max-w-page mx-auto px-4 sm:px-8 py-12 sm:py-16">
      <SectionHeader
        eyebrow="What you get"
        title={
          <>
            A real study experience,
            <br className="hidden sm:block" />{" "}
            <span className="italic text-accent">not a PDF viewer.</span>
          </>
        }
        subtitle="Six things ReadableHTML adds that scanned PDFs simply can't."
      />
      <ul className="mt-8 sm:mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {benefits.map((b) => (
          <li
            key={b.title}
            className="group rounded-xl border border-line bg-paper-raised px-5 py-5 hover:border-accent/40 hover:shadow-soft transition-all"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 grid place-items-center group-hover:bg-accent/15 transition-colors">
                <b.Icon className="h-4 w-4 text-accent" />
              </div>
              <div className="font-serif text-[17px] tracking-tightish text-ink">
                {b.title}
              </div>
            </div>
            <p className="text-[13.5px] leading-relaxed text-ink-muted">
              {b.desc}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
