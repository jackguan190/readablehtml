import Link from "next/link";
import { SignupForm } from "./SignupForm";

export const dynamic = "force-dynamic";

export default function SignupPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const next = searchParams.next ?? "/dashboard";
  return (
    <div className="min-h-screen bg-paper-sunken text-ink grid place-items-center px-4 py-16">
      <div className="w-full max-w-[400px]">
        <Link
          href="/"
          className="block text-2xs uppercase tracking-eyebrow text-ink-faint hover:text-accent transition-colors mb-6 no-tap-highlight"
        >
          ← ReadableHTML
        </Link>
        <div className="rounded-2xl border border-line bg-paper shadow-lift p-6 sm:p-8">
          <h1 className="font-serif text-[26px] tracking-tightish text-ink leading-tight">
            Create your study workspace.
          </h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            Email and password. Nothing else, for now.
          </p>
          <SignupForm next={next} />
        </div>
        <p className="mt-5 text-center text-[13px] text-ink-muted">
          Already have an account?{" "}
          <Link
            href={`/login${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="text-accent font-medium hover:underline"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
