import Link from "next/link";

export function NebuLanding() {
  return (
    <main className="min-h-screen bg-paper-sunken text-ink">
      <header className="border-b border-line bg-paper">
        <div className="max-w-page mx-auto flex h-14 items-center justify-between px-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2 no-tap-highlight">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-ink text-[12px] font-semibold text-paper">N</span>
            <span className="font-serif text-[16px] tracking-tightish">Nebu.AI</span>
          </Link>
          <Link href="/login?next=/onboarding" className="text-[13px] font-medium text-ink-muted transition-colors hover:text-ink">Log in</Link>
        </div>
      </header>

      <section className="max-w-page mx-auto px-4 py-20 sm:px-8 sm:py-28">
        <div className="max-w-[760px]">
          <p className="eyebrow text-accent">Your essay workspace</p>
          <h1 className="mt-4 font-serif text-[42px] leading-[1.04] tracking-tightish sm:text-[62px]">Write the essay your course is actually asking for.</h1>
          <p className="mt-6 max-w-[62ch] text-[17px] leading-7 text-ink-muted">Nebu keeps your assignment requirements, professor and TA guidance, course context, and notes together—so you can plan and revise a stronger essay that remains your own work.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup?next=/onboarding" className="inline-flex items-center justify-center rounded-lg bg-ink px-5 py-3 text-[14px] font-semibold text-paper shadow-sm transition-opacity hover:opacity-90 no-tap-highlight">Create your first assignment</Link>
            <Link href="/login?next=/onboarding" className="inline-flex items-center justify-center rounded-lg border border-line bg-paper px-5 py-3 text-[14px] font-semibold text-ink transition-colors hover:bg-paper-raised no-tap-highlight">Log in</Link>
          </div>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {[
            ["Start with the brief", "Capture the prompt, rubric, and assignment requirements in one place."],
            ["Keep guidance close", "Bring professor and TA feedback into the context of the essay you are writing."],
            ["Own the writing", "Use a clear workspace to make your own decisions, drafts, and revisions."],
          ].map(([title, copy]) => (
            <section key={title} className="rounded-2xl border border-line bg-paper p-5">
              <h2 className="font-serif text-[20px] tracking-tightish">{title}</h2>
              <p className="mt-2 text-[14px] leading-6 text-ink-muted">{copy}</p>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
