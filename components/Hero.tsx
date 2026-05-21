"use client";

import Link from "next/link";
import {
  ScanLine,
  Sparkles,
  Highlighter,
  Upload,
  ArrowRight,
  GraduationCap,
  LayoutGrid,
} from "lucide-react";

interface Props {
  onUpload: () => void;
  onSeeDemo: () => void;
  onSubmitPDF: () => void;
  userEmail?: string | null;
}

export function Hero({ onUpload, onSeeDemo, onSubmitPDF, userEmail }: Props) {
  const isAuthed = !!userEmail;
  return (
    <section className="max-w-page mx-auto px-4 sm:px-8 pt-10 sm:pt-14 pb-10 sm:pb-14">
      <div className="grid lg:grid-cols-[1fr_auto] gap-8 lg:gap-16 items-end">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-paper border border-line shadow-soft">
            <GraduationCap className="h-3 w-3 text-accent" />
            <span className="text-2xs font-medium uppercase tracking-eyebrow text-ink-muted">
              For students &amp; researchers
            </span>
          </div>

          <h1 className="mt-5 font-serif text-[2.25rem] sm:text-5xl lg:text-[3.75rem] leading-[1.04] tracking-tightish text-ink">
            Turn painful academic PDFs into{" "}
            <span className="italic text-accent">interactive study pages</span>.
          </h1>

          <p className="mt-5 text-ink-muted text-[15px] sm:text-[18px] leading-relaxed max-w-[60ch]">
            Upload a scanned chapter or dense article. Read it as{" "}
            <em className="text-ink not-italic font-medium">clean HTML</em> with{" "}
            <em className="text-ink not-italic font-medium">page anchors</em>,{" "}
            <em className="text-ink not-italic font-medium">summaries</em>,{" "}
            <em className="text-ink not-italic font-medium">glossary terms</em>,{" "}
            <em className="text-ink not-italic font-medium">highlights</em>,{" "}
            <em className="text-ink not-italic font-medium">notes</em>, and{" "}
            <em className="text-ink not-italic font-medium">original-page comparison</em>.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            {isAuthed ? (
              <Link
                href="/dashboard"
                className="group inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-ink text-paper text-[14px] font-medium shadow-soft hover:bg-ink/90 transition-all no-tap-highlight"
              >
                <LayoutGrid className="h-4 w-4" />
                Go to dashboard
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ) : (
              <Link
                href="/signup"
                className="group inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-ink text-paper text-[14px] font-medium shadow-soft hover:bg-ink/90 transition-all no-tap-highlight"
              >
                <Upload className="h-4 w-4" />
                Get started — free alpha
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            )}
            <button
              onClick={onSeeDemo}
              className="group inline-flex items-center gap-1.5 h-11 px-4 rounded-xl border border-line bg-paper text-ink text-[14px] font-medium hover:border-accent/50 hover:bg-paper-raised transition-all no-tap-highlight"
            >
              See interactive demo
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            {!isAuthed && (
              <button
                onClick={onUpload}
                className="hidden md:inline-flex items-center gap-1.5 text-[12.5px] text-ink-muted hover:text-accent transition-colors no-tap-highlight"
                title="Open the mock upload flow"
              >
                Or try the mock upload demo
              </button>
            )}
          </div>

          <button
            onClick={onSubmitPDF}
            className="group mt-4 inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-accent transition-colors no-tap-highlight"
          >
            Or send me one painful PDF to test
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>

          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-ink-muted">
            <Feature Icon={ScanLine} label="OCR-aware layout" />
            <Dot />
            <Feature Icon={Highlighter} label="Click-to-highlight" />
            <Dot />
            <Feature Icon={Sparkles} label="AI study tools" />
          </div>
        </div>

        <div className="hidden lg:block">
          <div className="relative">
            <div className="absolute -top-4 -right-4 -bottom-4 -left-4 rounded-2xl bg-gradient-to-br from-accent/10 via-transparent to-accent/15 blur-2xl" />
            <div className="relative grid grid-cols-2 gap-3 w-[320px]">
              <Card
                tone="scan"
                title="Original"
                subtitle="page 7 · scanned"
                lines={[
                  "Every generation of historians",
                  "inherits a favored prime",
                  "mover — the engine behind",
                  "the engines.",
                ]}
              />
              <Card
                tone="clean"
                title="ReadableHTML"
                subtitle="OCR + cleanup"
                lines={[
                  "Every generation of historians",
                  "inherits a favored",
                  "prime mover — the engine",
                  "behind the engines.",
                ]}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Feature({
  Icon,
  label,
}: {
  Icon: typeof ScanLine;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 text-accent" />
      <span>{label}</span>
    </span>
  );
}

function Dot() {
  return <span className="h-1 w-1 rounded-full bg-line-strong" />;
}

function Card({
  tone,
  title,
  subtitle,
  lines,
}: {
  tone: "scan" | "clean";
  title: string;
  subtitle: string;
  lines: string[];
}) {
  return (
    <div
      className={
        tone === "scan"
          ? "scan-paper rounded-md p-3 shadow-lift relative overflow-hidden"
          : "rounded-md p-3 shadow-lift border border-line bg-paper-raised"
      }
    >
      <div className="relative z-10">
        <div
          className={
            tone === "scan"
              ? "scan-text text-[9px] uppercase tracking-eyebrow opacity-70"
              : "text-2xs uppercase tracking-eyebrow text-accent"
          }
        >
          {subtitle}
        </div>
        <div
          className={
            tone === "scan"
              ? "scan-text mt-1 text-[11px] font-semibold uppercase tracking-wider"
              : "mt-1 font-serif text-[13px] font-semibold tracking-tightish text-ink"
          }
        >
          {title}
        </div>
        <div
          className={
            tone === "scan"
              ? "scan-text mt-2 space-y-0.5 text-[10px] leading-snug"
              : "mt-2 space-y-1 font-serif text-[10.5px] leading-snug text-ink"
          }
        >
          {lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
