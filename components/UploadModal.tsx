"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  X,
  FileText,
  Check,
  Loader2,
  ScanLine,
  Sparkles,
  ArrowRight,
  CircleCheckBig,
  CloudUpload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/Button";

type Stage = "idle" | "processing" | "done";

interface Step {
  id: "upload" | "detect" | "ocr" | "build";
  label: string;
  description: string;
  Icon: typeof Upload;
  duration: number;
}

const STEPS: Step[] = [
  {
    id: "upload",
    label: "Uploading",
    description: "Securely transferring your file",
    Icon: Upload,
    duration: 1400,
  },
  {
    id: "detect",
    label: "Detecting scanned PDF",
    description: "Analyzing page structure and layout",
    Icon: ScanLine,
    duration: 900,
  },
  {
    id: "ocr",
    label: "Running OCR",
    description: "Recognizing characters · mock confidence ~94%",
    Icon: FileText,
    duration: 1700,
  },
  {
    id: "build",
    label: "Building HTML study page",
    description: "Generating contents, terms, and notes",
    Icon: Sparkles,
    duration: 1100,
  },
];

const TOTAL_DURATION = STEPS.reduce((s, x) => s + x.duration, 0);

interface Props {
  open: boolean;
  onClose: () => void;
  onReady: () => void;
}

type FileMeta = { name: string; size: number };

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function UploadModal({ open, onClose, onReady }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<FileMeta | null>(null);
  const [activeStep, setActiveStep] = useState<number>(-1);
  const [stepProgress, setStepProgress] = useState<number>(0);

  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      setStage("idle");
      setFile(null);
      setActiveStep(-1);
      setStepProgress(0);
    }, 200);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stage !== "processing") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, stage, onClose]);

  useEffect(() => {
    if (stage !== "processing") return;
    let cancelled = false;
    const timeouts: number[] = [];
    const intervals: number[] = [];

    function startStep(i: number) {
      if (cancelled) return;
      if (i >= STEPS.length) {
        setStage("done");
        return;
      }
      setActiveStep(i);
      setStepProgress(0);

      const step = STEPS[i];
      const intervalMs = 40;
      const ticks = Math.max(1, Math.round(step.duration / intervalMs));
      let tick = 0;
      const iv = window.setInterval(() => {
        if (cancelled) return;
        tick++;
        setStepProgress(Math.min(100, Math.round((tick / ticks) * 100)));
        if (tick >= ticks) window.clearInterval(iv);
      }, intervalMs);
      intervals.push(iv);

      const to = window.setTimeout(() => startStep(i + 1), step.duration);
      timeouts.push(to);
    }

    startStep(0);

    return () => {
      cancelled = true;
      timeouts.forEach(window.clearTimeout);
      intervals.forEach(window.clearInterval);
    };
  }, [stage]);

  function pickFile(meta: FileMeta) {
    setFile(meta);
    setStage("processing");
  }

  function handleOpenStudyPage() {
    onReady();
    setTimeout(onClose, 150);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink/55 backdrop-blur-sm animate-fade-in"
        onClick={() => {
          if (stage !== "processing") onClose();
        }}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Upload PDF"
        className="relative w-full max-w-[540px] rounded-2xl bg-paper border border-line shadow-lift animate-slide-up overflow-hidden max-h-[92vh] flex flex-col"
      >
        <ProgressRail stage={stage} activeStep={activeStep} stepProgress={stepProgress} />

        <div className="flex items-center justify-between px-5 h-12 border-b border-line shrink-0">
          <div className="flex items-center gap-2">
            <CloudUpload className="h-4 w-4 text-accent" />
            <span className="eyebrow">
              {stage === "idle" && "Upload PDF"}
              {stage === "processing" && "Processing"}
              {stage === "done" && "Ready"}
            </span>
          </div>
          {stage !== "processing" && (
            <button
              onClick={onClose}
              className="h-8 w-8 grid place-items-center rounded-md hover:bg-paper-sunken text-ink-muted hover:text-ink transition-colors no-tap-highlight"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div
          key={stage}
          className="flex-1 overflow-y-auto scroll-fade p-5 sm:p-6 animate-fade-in"
        >
          {stage === "idle" && <IdleView onPick={pickFile} />}
          {stage === "processing" && file && (
            <ProcessingView
              file={file}
              activeStep={activeStep}
              stepProgress={stepProgress}
            />
          )}
          {stage === "done" && file && (
            <DoneView file={file} onOpen={handleOpenStudyPage} />
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressRail({
  stage,
  activeStep,
  stepProgress,
}: {
  stage: Stage;
  activeStep: number;
  stepProgress: number;
}) {
  const pct = useMemo(() => {
    if (stage === "idle") return 0;
    if (stage === "done") return 100;
    if (activeStep < 0) return 0;
    let elapsed = 0;
    for (let i = 0; i < activeStep; i++) elapsed += STEPS[i].duration;
    elapsed += (stepProgress / 100) * STEPS[activeStep].duration;
    return Math.min(100, Math.round((elapsed / TOTAL_DURATION) * 100));
  }, [stage, activeStep, stepProgress]);

  return (
    <div className="h-0.5 bg-paper-sunken">
      <div
        className="h-full bg-accent transition-all duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function IdleView({ onPick }: { onPick: (m: FileMeta) => void }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) onPick({ name: f.name, size: f.size });
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!drag) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={cn(
          "relative rounded-xl border-2 border-dashed p-8 sm:p-10 text-center cursor-pointer transition-all duration-200 no-tap-highlight",
          drag
            ? "border-accent bg-accent/[0.06]"
            : "border-line hover:border-accent/50 hover:bg-paper-sunken/40",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick({ name: f.name, size: f.size });
          }}
        />
        <div className="grid place-items-center mb-3">
          <div
            className={cn(
              "h-14 w-14 rounded-full grid place-items-center transition-all",
              drag ? "bg-accent/15 scale-110" : "bg-paper-sunken",
            )}
          >
            <CloudUpload
              className={cn(
                "h-6 w-6 transition-colors",
                drag ? "text-accent" : "text-ink-muted",
              )}
            />
          </div>
        </div>
        <p className="font-serif text-[19px] tracking-tightish text-ink leading-snug">
          {drag ? "Drop to upload" : "Drop your PDF here"}
        </p>
        <p className="mt-1 text-[12.5px] text-ink-muted">
          or{" "}
          <span className="text-accent font-medium underline-offset-2 hover:underline">
            click to browse
          </span>
        </p>
        <p className="mt-5 text-2xs text-ink-faint">
          Scanned PDFs · up to 200 MB · processed locally in this demo
        </p>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <button
          onClick={() =>
            onPick({
              name: "the-practice-of-history.pdf",
              size: 14_823_456,
            })
          }
          className="text-2xs uppercase tracking-eyebrow text-ink-muted hover:text-accent transition-colors no-tap-highlight"
        >
          Or try a sample PDF
        </button>
        <span className="h-px flex-1 bg-line" />
      </div>

      <ul className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <Feature label="OCR-aware" value="~94% est." />
        <Feature label="Layout" value="Reflowable" />
        <Feature label="Privacy" value="On-device" good />
      </ul>
    </div>
  );
}

function Feature({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <li className="rounded-lg border border-line bg-paper-raised px-3 py-2.5">
      <div className="eyebrow">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-[12.5px] font-medium tabular-nums",
          good ? "text-good" : "text-ink",
        )}
      >
        {value}
      </div>
    </li>
  );
}

function ProcessingView({
  file,
  activeStep,
  stepProgress,
}: {
  file: FileMeta;
  activeStep: number;
  stepProgress: number;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 rounded-xl border border-line bg-paper-sunken/40 px-3 py-2.5 mb-5">
        <div className="h-10 w-10 rounded-lg bg-paper-deep grid place-items-center shrink-0">
          <FileText className="h-4 w-4 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-ink truncate">
            {file.name}
          </div>
          <div className="text-2xs text-ink-muted tabular-nums">
            {formatSize(file.size)} · scanned PDF
          </div>
        </div>
        <div className="text-2xs text-ink-subtle uppercase tracking-eyebrow">
          In&nbsp;progress
        </div>
      </div>

      <ol className="space-y-2">
        {STEPS.map((step, i) => {
          const status: "done" | "active" | "pending" =
            i < activeStep ? "done" : i === activeStep ? "active" : "pending";
          const progress =
            status === "active" ? stepProgress : status === "done" ? 100 : 0;
          return (
            <StepRow
              key={step.id}
              step={step}
              status={status}
              progress={progress}
              index={i + 1}
            />
          );
        })}
      </ol>
    </div>
  );
}

function StepRow({
  step,
  status,
  progress,
  index,
}: {
  step: Step;
  status: "done" | "active" | "pending";
  progress: number;
  index: number;
}) {
  return (
    <li
      className={cn(
        "rounded-xl border px-3 py-2.5 transition-all",
        status === "active"
          ? "border-accent/40 bg-accent/[0.04] shadow-soft"
          : status === "done"
            ? "border-line bg-paper-raised"
            : "border-line bg-paper-raised opacity-70",
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "h-7 w-7 rounded-full grid place-items-center shrink-0 transition-colors",
            status === "done"
              ? "bg-good text-paper"
              : status === "active"
                ? "bg-accent text-paper"
                : "bg-paper-sunken text-ink-faint",
          )}
        >
          {status === "done" && <Check className="h-3.5 w-3.5" />}
          {status === "active" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {status === "pending" && (
            <span className="text-[10px] font-medium tabular-nums">{index}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className={cn(
              "text-[13px] font-medium",
              status === "pending" ? "text-ink-muted" : "text-ink",
            )}
          >
            {step.label}
          </div>
          <div className="text-2xs text-ink-muted truncate">
            {step.description}
          </div>
        </div>
        <div className="text-2xs text-ink-subtle tabular-nums shrink-0 w-10 text-right">
          {status === "done" && "Done"}
          {status === "active" && `${Math.round(progress)}%`}
          {status === "pending" && "—"}
        </div>
      </div>
      {status === "active" && (
        <div className="mt-2 h-1 rounded-full bg-paper-sunken overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </li>
  );
}

function DoneView({
  file,
  onOpen,
}: {
  file: FileMeta;
  onOpen: () => void;
}) {
  return (
    <div className="text-center py-2">
      <div className="grid place-items-center mb-4">
        <div className="relative h-16 w-16 grid place-items-center">
          <span className="absolute inset-0 rounded-full bg-good/15 animate-ping opacity-60" />
          <span className="relative h-14 w-14 rounded-full bg-good/15 grid place-items-center">
            <CircleCheckBig className="h-6 w-6 text-good" />
          </span>
        </div>
      </div>
      <h2 className="font-serif text-[22px] tracking-tightish text-ink leading-tight">
        Your study page is ready
      </h2>
      <p className="mt-1.5 text-[13px] text-ink-muted">
        <span className="font-medium text-ink">{file.name}</span> ·{" "}
        <span className="tabular-nums">{formatSize(file.size)}</span>
      </p>

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Stat value="287" label="Pages" />
        <Stat value="~94%" label="OCR est." good />
        <Stat value="5" label="Chapters" />
        <Stat value="14" label="Key terms" />
      </div>

      <Button onClick={onOpen} className="mt-7 w-full">
        Open study page
        <ArrowRight className="h-4 w-4" />
      </Button>

      <p className="mt-3 text-2xs text-ink-faint">
        This demo opens our pre-built sample. Real document support is in the
        works.
      </p>
    </div>
  );
}

function Stat({
  value,
  label,
  good,
}: {
  value: string;
  label: string;
  good?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-paper-raised px-3 py-2.5">
      <div
        className={cn(
          "font-serif text-[22px] tracking-tightish tabular-nums leading-none",
          good ? "text-good" : "text-ink",
        )}
      >
        {value}
      </div>
      <div className="mt-1 eyebrow">{label}</div>
    </div>
  );
}
