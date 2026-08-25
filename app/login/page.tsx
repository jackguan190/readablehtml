import Link from "next/link";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const next = searchParams.next ?? "/onboarding";
  const errorParam = searchParams.error
    ? "Sign-in failed. Please try again."
    : null;
  return (
    <div className="min-h-screen bg-paper-sunken text-ink grid place-items-center px-4 py-16">
      <div className="w-full max-w-[400px]">
        <Link
          href="/"
          className="block text-2xs uppercase tracking-eyebrow text-ink-faint hover:text-accent transition-colors mb-6 no-tap-highlight"
        >
          ← Nebu.AI
        </Link>
        <div className="rounded-2xl border border-line bg-paper shadow-lift p-6 sm:p-8">
          <h1 className="font-serif text-[26px] tracking-tightish text-ink leading-tight">
            Welcome back.
          </h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            Log in to your essay workspace.
          </p>
          <LoginForm next={next} initialError={errorParam} />
        </div>
        <p className="mt-5 text-center text-[13px] text-ink-muted">
          New here?{" "}
          <Link
            href={`/signup?next=${encodeURIComponent(next)}`}
            className="text-accent font-medium hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
