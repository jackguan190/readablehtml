"use client";

import { forwardRef, useRef, useState } from "react";
import {
  Mail,
  Paperclip,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  X,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const UserTestingCTA = forwardRef<HTMLElement>(function UserTestingCTA(
  _props,
  ref,
) {
  const [email, setEmail] = useState("");
  const [details, setDetails] = useState("");
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitted(true);
  }

  function reset() {
    setSubmitted(false);
    setEmail("");
    setDetails("");
    setFile(null);
  }

  return (
    <section
      ref={ref}
      id="cta"
      className="max-w-page mx-auto px-4 sm:px-8 py-12 sm:py-20 scroll-mt-20"
    >
      <div className="relative rounded-3xl border border-line bg-gradient-to-br from-paper to-paper-raised shadow-lift overflow-hidden">
        <div
          aria-hidden
          className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-accent/15 blur-3xl pointer-events-none"
        />
        <div className="relative grid md:grid-cols-2 gap-8 sm:gap-12 p-6 sm:p-10 lg:p-14">
          <div className="max-w-md">
            <div className="eyebrow text-accent">User testing</div>
            <h2 className="mt-2 font-serif text-[28px] sm:text-4xl lg:text-[42px] tracking-tightish text-ink leading-[1.06]">
              Send me one painful PDF{" "}
              <span className="italic text-accent">to test.</span>
            </h2>
            <p className="mt-4 text-[15px] sm:text-[16px] text-ink-muted leading-relaxed">
              During the beta, I&apos;m hand-processing a few PDFs each week.
              Drop yours below — a scanned chapter, a brutally formatted paper,
              anything — and you&apos;ll get the ReadableHTML version in your
              inbox within 48 hours.
            </p>
            <ul className="mt-6 space-y-2.5 text-[13.5px] text-ink-muted">
              <Bullet>Free during beta · no signup required</Bullet>
              <Bullet>Returned as an interactive HTML study page</Bullet>
              <Bullet>Your feedback shapes what we build next</Bullet>
            </ul>
          </div>

          {submitted ? (
            <SuccessState email={email} onReset={reset} />
          ) : (
            <form
              onSubmit={handleSubmit}
              className="relative rounded-2xl bg-paper border border-line shadow-soft p-5 sm:p-6 space-y-4"
            >
              <Field label="Your email" required>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@university.edu"
                  className="w-full rounded-lg border border-line bg-paper-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-faint outline-none focus:border-accent/50 focus:shadow-soft transition-all"
                />
              </Field>

              <Field label="What's frustrating about it?">
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  rows={3}
                  placeholder="Scanned, hard to search, professor expects citations by page…"
                  className="w-full resize-none rounded-lg border border-line bg-paper-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-faint outline-none focus:border-accent/50 focus:shadow-soft transition-all"
                />
              </Field>

              <Field label="PDF (optional)">
                {file ? (
                  <div className="flex items-center gap-2.5 rounded-lg border border-line bg-paper-raised px-3 py-2.5">
                    <div className="h-7 w-7 rounded-md bg-paper-sunken grid place-items-center shrink-0">
                      <FileText className="h-3.5 w-3.5 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-ink truncate">
                        {file.name}
                      </div>
                      <div className="text-2xs text-ink-muted tabular-nums">
                        {formatSize(file.size)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="h-7 w-7 grid place-items-center rounded-md hover:bg-paper-sunken text-ink-muted hover:text-ink transition-colors no-tap-highlight"
                      aria-label="Remove file"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full text-center rounded-lg border-2 border-dashed border-line hover:border-accent/40 bg-paper-raised/50 px-3 py-3 text-[13px] text-ink-muted transition-colors no-tap-highlight"
                  >
                    <Paperclip className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5 text-accent" />
                    Attach a PDF
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setFile({ name: f.name, size: f.size });
                  }}
                />
              </Field>

              <button
                type="submit"
                disabled={!email.trim()}
                className={cn(
                  "w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl text-[14px] font-medium transition-colors no-tap-highlight",
                  email.trim()
                    ? "bg-ink text-paper hover:bg-ink/90"
                    : "bg-paper-sunken text-ink-faint cursor-not-allowed",
                )}
              >
                <Mail className="h-4 w-4" />
                Submit my PDF
                <ArrowRight className="h-4 w-4" />
              </button>
              <p className="text-2xs text-ink-faint text-center">
                Static demo · this form doesn&apos;t send anything yet.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
});

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block mb-1.5 text-[12px] font-medium text-ink-muted">
        {label}
        {required && <span className="text-accent ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <Sparkles className="h-3.5 w-3.5 text-accent mt-0.5 shrink-0" />
      <span>{children}</span>
    </li>
  );
}

function SuccessState({
  email,
  onReset,
}: {
  email: string;
  onReset: () => void;
}) {
  return (
    <div className="relative rounded-2xl bg-paper border border-line shadow-soft p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[280px] animate-fade-in">
      <div className="grid place-items-center mb-4">
        <div className="relative h-14 w-14 grid place-items-center">
          <span className="absolute inset-0 rounded-full bg-good/15 animate-ping opacity-60" />
          <span className="relative h-12 w-12 rounded-full bg-good/15 grid place-items-center">
            <CheckCircle2 className="h-6 w-6 text-good" />
          </span>
        </div>
      </div>
      <h3 className="font-serif text-[22px] tracking-tightish text-ink">
        Thanks — we&apos;ll be in touch.
      </h3>
      <p className="mt-2 max-w-sm text-[13.5px] text-ink-muted leading-relaxed">
        We&apos;ll reach out to{" "}
        <strong className="text-ink font-medium break-all">{email}</strong>{" "}
        within 48 hours with your ReadableHTML version.
      </p>
      <button
        onClick={onReset}
        className="mt-5 inline-flex items-center gap-1 text-[12px] text-ink-muted hover:text-accent transition-colors no-tap-highlight"
      >
        Submit another PDF
        <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}
