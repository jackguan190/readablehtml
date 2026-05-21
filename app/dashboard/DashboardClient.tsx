"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CloudUpload,
  FileText,
  Loader2,
  Trash2,
  LogOut,
  ArrowRight,
  CircleAlert,
  CircleCheckBig,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  createDocumentRecord,
  deleteDocument,
  runBasicPdfProcessing,
} from "@/lib/documents/actions";
import { signOut } from "@/lib/auth/actions";
import type { DocumentRow, DocumentStatus } from "@/lib/documents/types";
import type { UsageSnapshot } from "@/lib/usage/quota";

const STORAGE_BUCKET = "documents";

function titleFromFilename(filename: string): string {
  const noExt = filename.replace(/\.pdf$/i, "");
  const cleaned = noExt.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : filename;
}

interface Props {
  userEmail: string;
  userId: string;
  initialDocuments: DocumentRow[];
  usage: UsageSnapshot;
}

type UploadStage = "idle" | "uploading" | "processing" | "error";

export function DashboardClient({
  userEmail,
  userId,
  initialDocuments,
  usage,
}: Props) {
  const router = useRouter();
  const [docs, setDocs] = useState<DocumentRow[]>(initialDocuments);
  const [stage, setStage] = useState<UploadStage>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [quotaBlocked, setQuotaBlocked] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pdfsUsed = usage.pdfsUploaded;
  const pdfsLimit = usage.limits.pdfs;
  const pdfsAtLimit = pdfsUsed >= pdfsLimit;

  const handleUpload = useCallback(
    async (file: File) => {
      setUploadError(null);
      setQuotaBlocked(false);
      setStage("uploading");

      const supabase = createSupabaseBrowserClient();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const tmpId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const storagePath = `${userId}/${tmpId}/${safeName}`;
      let didUpload = false;

      try {
        const { error: uploadErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || "application/pdf",
          });
        if (uploadErr) throw new Error(uploadErr.message);
        didUpload = true;

        const createRes = await createDocumentRecord({
          title: titleFromFilename(file.name),
          storagePath,
          fileSizeBytes: file.size,
        });
        if ("error" in createRes) {
          // clean up the orphan storage file if record creation failed
          if (didUpload) {
            await supabase.storage
              .from(STORAGE_BUCKET)
              .remove([storagePath])
              .catch(() => {});
          }
          if (createRes.quotaExceeded) {
            setQuotaBlocked(true);
          }
          throw new Error(createRes.error);
        }
        const docId = createRes.data.id;

        setStage("processing");
        const processRes = await runBasicPdfProcessing(docId);
        if ("error" in processRes) throw new Error(processRes.error);

        router.refresh();
        router.push(`/documents/${docId}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed.";
        setUploadError(message);
        setStage("error");
      }
    },
    [router, userId],
  );

  return (
    <div className="min-h-screen bg-paper-sunken text-ink">
      <header className="border-b border-line bg-paper">
        <div className="max-w-page mx-auto px-4 sm:px-8 h-14 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-ink no-tap-highlight"
          >
            <span className="h-7 w-7 rounded-md bg-ink text-paper grid place-items-center text-[12px] font-semibold">
              R
            </span>
            <span className="font-serif text-[16px] tracking-tightish">
              ReadableHTML
            </span>
            <span className="ml-2 eyebrow text-ink-faint">Dashboard</span>
          </Link>
          <div className="flex items-center gap-3 text-[12.5px] text-ink-muted">
            <span className="hidden sm:inline truncate max-w-[200px]">
              {userEmail}
            </span>
            <form
              action={async () => {
                await signOut();
              }}
            >
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md hover:bg-paper-sunken hover:text-ink transition-colors no-tap-highlight"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-page mx-auto px-4 sm:px-8 py-8 sm:py-12">
        <section className="mb-8 sm:mb-10">
          <div className="eyebrow text-accent">Your library</div>
          <h1 className="mt-1.5 font-serif text-[28px] sm:text-[36px] tracking-tightish leading-tight">
            Upload a PDF to begin.
          </h1>
          <p className="mt-2 text-[14px] text-ink-muted max-w-[60ch]">
            Alpha — text-based PDFs are extracted directly; scanned PDFs fall
            back to demo content until OCR ships.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <UsageChip
              label="PDFs this month"
              used={pdfsUsed}
              limit={pdfsLimit}
              atLimit={pdfsAtLimit}
            />
            <UsageChip
              label="AI actions"
              used={usage.aiActions}
              limit={usage.limits.ai}
              note="coming soon"
            />
          </div>
        </section>

        <UploadCard
          drag={drag}
          setDrag={setDrag}
          stage={stage}
          uploadError={uploadError}
          onPick={(file) => {
            if (file) handleUpload(file);
          }}
          inputRef={inputRef}
          quotaBlocked={quotaBlocked || pdfsAtLimit}
          quotaMessage={
            pdfsAtLimit
              ? `Monthly limit reached (${pdfsLimit} PDFs/month on the alpha). Delete an existing document or wait until next month.`
              : null
          }
        />

        <section className="mt-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="eyebrow">Documents · {docs.length}</h2>
          </div>
          {docs.length === 0 ? (
            <EmptyDocs />
          ) : (
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {docs.map((d) => (
                <DocumentCard
                  key={d.id}
                  doc={d}
                  onDelete={(id) =>
                    setDocs((prev) => prev.filter((x) => x.id !== id))
                  }
                />
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function UploadCard({
  drag,
  setDrag,
  stage,
  uploadError,
  onPick,
  inputRef,
  quotaBlocked,
  quotaMessage,
}: {
  drag: boolean;
  setDrag: (v: boolean) => void;
  stage: UploadStage;
  uploadError: string | null;
  onPick: (file: File | null) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  quotaBlocked: boolean;
  quotaMessage: string | null;
}) {
  const busy = stage === "uploading" || stage === "processing";
  const blocked = quotaBlocked && !busy;
  return (
    <div
      onClick={() => !busy && !blocked && inputRef.current?.click()}
      onDragOver={(e) => {
        if (busy || blocked) return;
        e.preventDefault();
        if (!drag) setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        if (busy || blocked) return;
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files[0];
        if (f) onPick(f);
      }}
      role="button"
      tabIndex={blocked ? -1 : 0}
      aria-disabled={blocked || undefined}
      onKeyDown={(e) => {
        if (busy || blocked) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      className={cn(
        "relative rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-all no-tap-highlight",
        busy
          ? "cursor-not-allowed border-line bg-paper-raised"
          : blocked
            ? "cursor-not-allowed border-amber-300 bg-amber-50/60"
            : "cursor-pointer",
        !busy &&
          !blocked &&
          (drag
            ? "border-accent bg-accent/[0.06]"
            : "border-line bg-paper hover:border-accent/50 hover:bg-paper-raised"),
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      <div className="grid place-items-center mb-3">
        <div
          className={cn(
            "h-14 w-14 rounded-full grid place-items-center transition-all",
            drag ? "bg-accent/15 scale-110" : "bg-paper-sunken",
          )}
        >
          {stage === "uploading" || stage === "processing" ? (
            <Loader2 className="h-6 w-6 text-accent animate-spin" />
          ) : stage === "error" ? (
            <CircleAlert className="h-6 w-6 text-red-600" />
          ) : (
            <CloudUpload
              className={cn(
                "h-6 w-6 transition-colors",
                drag ? "text-accent" : "text-ink-muted",
              )}
            />
          )}
        </div>
      </div>
      <p className="font-serif text-[19px] tracking-tightish text-ink leading-snug">
        {stage === "uploading" && "Uploading…"}
        {stage === "processing" && "Processing…"}
        {stage === "error" && !blocked && "Something went wrong"}
        {blocked && "Monthly upload limit reached"}
        {!blocked &&
          (stage === "idle" || stage === "error") &&
          (drag ? "Drop to upload" : "Drop your PDF here")}
      </p>
      <p className="mt-1 text-[12.5px] text-ink-muted">
        {blocked
          ? (quotaMessage ?? "Try again next month.")
          : stage === "error" && uploadError
            ? uploadError
            : "or click to browse · stored privately in your account"}
      </p>
    </div>
  );
}

function UsageChip({
  label,
  used,
  limit,
  atLimit,
  note,
}: {
  label: string;
  used: number;
  limit: number;
  atLimit?: boolean;
  note?: string;
}) {
  const isUnlimited = limit > 0 && atLimit;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium",
        isUnlimited
          ? "border-amber-300 bg-amber-50 text-amber-800"
          : "border-line bg-paper text-ink-muted",
      )}
    >
      <span className="uppercase tracking-eyebrow text-[10px] text-ink-faint">
        {label}
      </span>
      <span className="tabular-nums text-ink">
        {used} / {limit}
      </span>
      {note && (
        <span className="text-2xs uppercase tracking-eyebrow text-accent">
          · {note}
        </span>
      )}
    </span>
  );
}

function EmptyDocs() {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-paper px-6 py-10 text-center">
      <div className="h-10 w-10 mx-auto rounded-full bg-paper-sunken grid place-items-center mb-3">
        <FileText className="h-4 w-4 text-ink-subtle" />
      </div>
      <h3 className="font-serif text-[15px] text-ink">No documents yet</h3>
      <p className="mt-1 text-[12.5px] text-ink-muted max-w-[36ch] mx-auto">
        Upload your first PDF above. Notes you save will stick to the document.
      </p>
    </div>
  );
}

function DocumentCard({
  doc,
  onDelete,
}: {
  doc: DocumentRow;
  onDelete: (id: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${doc.title}"?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteDocument(doc.id);
      if ("error" in res) {
        setError(res.error);
      } else {
        onDelete(doc.id);
      }
    });
  }

  const date = new Date(doc.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const sizeMB =
    doc.file_size_bytes != null ? (doc.file_size_bytes / (1024 * 1024)).toFixed(1) : null;

  return (
    <li className="group relative rounded-xl border border-line bg-paper hover:border-accent/40 hover:bg-paper-raised transition-all">
      <Link
        href={`/documents/${doc.id}`}
        className="block px-4 py-4 no-tap-highlight"
      >
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-paper-sunken grid place-items-center shrink-0">
            <FileText className="h-4 w-4 text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-serif text-[15px] tracking-tightish text-ink truncate">
              {doc.title}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-ink-faint tabular-nums">
              <StatusBadge status={doc.status} />
              <span className="h-1 w-1 rounded-full bg-line-strong" />
              <span>{date}</span>
              {sizeMB && (
                <>
                  <span className="h-1 w-1 rounded-full bg-line-strong" />
                  <span>{sizeMB} MB</span>
                </>
              )}
            </div>
            {doc.error && (
              <p className="mt-1.5 text-[11.5px] text-red-700">{doc.error}</p>
            )}
          </div>
          {(doc.status === "ready" || doc.status === "needs_ocr") && (
            <ArrowRight className="h-4 w-4 text-ink-faint group-hover:text-accent transition-colors mt-1.5" />
          )}
        </div>
      </Link>
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        title="Delete document"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 disabled:opacity-50 h-7 w-7 grid place-items-center rounded-md bg-paper hover:bg-red-50 hover:text-red-700 text-ink-faint transition-all no-tap-highlight"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      {error && (
        <p className="px-4 pb-3 text-[11.5px] text-red-700">{error}</p>
      )}
    </li>
  );
}

function StatusBadge({ status }: { status: DocumentStatus }) {
  const map: Record<
    DocumentStatus,
    { label: string; tone: string; Icon?: typeof Loader2 }
  > = {
    uploaded: { label: "Uploaded", tone: "text-ink-muted" },
    queued: { label: "Queued", tone: "text-ink-muted" },
    processing: {
      label: "Processing",
      tone: "text-accent",
      Icon: Loader2,
    },
    ready: { label: "Ready", tone: "text-emerald-700", Icon: CircleCheckBig },
    needs_ocr: {
      label: "Needs OCR",
      tone: "text-amber-700",
      Icon: CircleAlert,
    },
    failed: { label: "Failed", tone: "text-red-700", Icon: CircleAlert },
  };
  const m = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 uppercase tracking-eyebrow font-medium",
        m.tone,
      )}
    >
      {m.Icon && (
        <m.Icon
          className={cn(
            "h-2.5 w-2.5",
            status === "processing" && "animate-spin",
          )}
        />
      )}
      {m.label}
    </span>
  );
}
