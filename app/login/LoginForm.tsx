"use client";

import { useState, useTransition } from "react";
import { signInWithPassword } from "@/lib/auth/actions";

interface Props {
  next: string;
  initialError: string | null;
}

export function LoginForm({ next, initialError }: Props) {
  const [error, setError] = useState<string | null>(initialError);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await signInWithPassword(formData);
      if (res && "error" in res) setError(res.error);
    });
  }

  return (
    <form action={handleSubmit} className="mt-6 space-y-3">
      <input type="hidden" name="next" value={next} />
      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
      />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
      />
      {error && (
        <p className="text-[12.5px] text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 w-full h-11 rounded-xl bg-ink text-paper font-medium text-[14px] hover:bg-ink/90 disabled:opacity-60 transition-all no-tap-highlight"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

function Field({
  name,
  label,
  type,
  autoComplete,
  required,
}: {
  name: string;
  label: string;
  type: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-2xs uppercase tracking-eyebrow text-ink-muted">
        {label}
      </span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        className="mt-1 w-full h-11 rounded-xl border border-line bg-paper px-3 text-[14px] text-ink placeholder:text-ink-subtle outline-none focus:border-accent/50 focus:shadow-soft transition-all"
      />
    </label>
  );
}
