"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { Hero } from "@/components/Hero";
import { PainPoints } from "@/components/PainPoints";
import { BeforeAfter } from "@/components/BeforeAfter";
import { Benefits } from "@/components/Benefits";
import { HowItWorks } from "@/components/HowItWorks";
import { UserTestingCTA } from "@/components/UserTestingCTA";
import { Sidebar } from "@/components/Sidebar";
import { ScanView } from "@/components/ScanView";
import { ReadingView } from "@/components/ReadingView";
import { SplitView } from "@/components/SplitView";
import { NotesPanel, type Note } from "@/components/NotesPanel";
import { Drawer } from "@/components/Drawer";
import { MobileBottomBar } from "@/components/MobileBottomBar";
import { UploadModal } from "@/components/UploadModal";
import type { ViewMode } from "@/components/ViewToggle";
import { sections } from "@/lib/content";

const NOTES_KEY = "rh-notes-v2";
const THEME_KEY = "rh-theme";

function seedNotes(): Note[] {
  const now = Date.now();
  return [
    {
      id: "hi-prime-1",
      kind: "highlight",
      sectionId: "prime-movers",
      text: "The historian's task is not to crown a single prime mover but to weigh them against one another in the specific case at hand.",
      createdAt: now - 1000 * 60 * 14,
      meta: { page: 8 },
    },
    {
      id: "seed-quote-prime",
      kind: "quote",
      sectionId: "prime-movers",
      text: "Every generation of historians inherits a favored prime mover — the engine behind the engines.",
      createdAt: now - 1000 * 60 * 26,
      meta: { page: 7 },
    },
    {
      id: "seed-glossary-prime",
      kind: "glossary",
      sectionId: "prime-movers",
      text: "A cause taken to be foundational — the explanation behind the explanations.",
      createdAt: now - 1000 * 60 * 22,
      meta: { term: "prime mover", page: 7 },
    },
    {
      id: "seed-ai-prime-1",
      kind: "ai",
      sectionId: "prime-movers",
      text: "The author argues no single cause explains complex events. He uses Rome's collapse to show that demography, fiscal stress, climate, and migration must all be weighed together — none alone suffices.",
      createdAt: now - 1000 * 60 * 34,
      meta: { topic: "What is a 'prime mover'?", page: 7 },
    },
    {
      id: "seed-ai-prime-2",
      kind: "ai",
      sectionId: "prime-movers",
      text: "Structural causes are slow, durable conditions (geography, demography). Contingent causes are sharp triggers (an assassination, a harvest failure). Good history tracks both.",
      createdAt: now - 1000 * 60 * 48,
      meta: { topic: "structural vs. contingent causes", page: 9 },
    },
    {
      id: "seed-note-prime",
      kind: "note",
      sectionId: "prime-movers",
      text: "Compare this framing with Braudel's longue durée — same instinct, different scale.",
      createdAt: now - 1000 * 60 * 6,
      meta: { page: 10 },
    },
  ];
}

interface HomeClientProps {
  userEmail: string | null;
}

export function HomeClient({ userEmail }: HomeClientProps) {
  const [mode, setMode] = useState<ViewMode>("after");
  const [activeId, setActiveId] = useState<string>(sections[2].id);
  const [notes, setNotes] = useState<Note[]>([]);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [hydrated, setHydrated] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<"toc" | "notes" | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const demoRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLElement>(null);

  const scrollToDemo = useCallback(() => {
    const el = demoRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.remove("pulse-once");
    // Force reflow so the animation can replay.
    void el.offsetWidth;
    el.classList.add("pulse-once");
    window.setTimeout(() => el.classList.remove("pulse-once"), 1700);
  }, []);

  const scrollToCTA = useCallback(() => {
    ctaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NOTES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Note[];
        setNotes(parsed.length > 0 ? parsed : seedNotes());
      } else {
        setNotes(seedNotes());
      }
    } catch {
      setNotes(seedNotes());
    }
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    } catch {}
  }, [notes, hydrated]);

  const toggleTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
    setTheme(next);
  }, [theme]);

  const activeIndex = useMemo(
    () => sections.findIndex((s) => s.id === activeId),
    [activeId],
  );
  const activeSection = sections[activeIndex] ?? sections[0];

  const activeHighlights = useMemo(() => {
    return new Set(
      notes
        .filter((n) => n.kind === "highlight" && n.sectionId === activeId)
        .map((n) => n.id),
    );
  }, [notes, activeId]);

  const toggleHighlight = useCallback(
    (id: string, text: string, sectionId: string, page?: number) => {
      setNotes((prev) => {
        const exists = prev.find((n) => n.id === id && n.kind === "highlight");
        if (exists) return prev.filter((n) => n.id !== id);
        return [
          {
            id,
            kind: "highlight",
            sectionId,
            text,
            createdAt: Date.now(),
            meta: page != null ? { page } : undefined,
          },
          ...prev,
        ];
      });
    },
    [],
  );

  const addNote = useCallback((sectionId: string, text: string) => {
    setNotes((prev) => [
      {
        id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind: "note",
        sectionId,
        text,
        createdAt: Date.now(),
      },
      ...prev,
    ]);
  }, []);

  const removeNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return (
    <div className="min-h-screen bg-paper-sunken text-ink">
      <TopBar
        mode={mode}
        setMode={setMode}
        theme={theme}
        toggleTheme={toggleTheme}
        onOpenMobileToc={() => setMobileSheet("toc")}
        onUpload={userEmail ? undefined : () => setUploadOpen(true)}
        userEmail={userEmail}
      />

      <Hero
        userEmail={userEmail}
        onUpload={() => setUploadOpen(true)}
        onSeeDemo={scrollToDemo}
        onSubmitPDF={scrollToCTA}
      />

      <PainPoints />

      <BeforeAfter />

      <Benefits />

      <main className="max-w-page mx-auto px-3 sm:px-6 lg:px-8 pb-12">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="max-w-2xl">
            <div className="eyebrow text-accent">Try it now</div>
            <h2 className="mt-1.5 font-serif text-[22px] sm:text-3xl tracking-tightish text-ink leading-tight">
              The full study page, with real interactions.
            </h2>
            <p className="hidden sm:block mt-1 text-[13.5px] text-ink-muted">
              Toggle <em className="text-ink not-italic font-medium">Before</em>, <em className="text-ink not-italic font-medium">After</em>, or <em className="text-ink not-italic font-medium">Split</em> in the top bar. Click any underlined sentence to highlight it.
            </p>
          </div>
        </div>
        <div
          id="demo"
          ref={demoRef}
          className="scroll-mt-20 rounded-2xl border border-line bg-paper shadow-lift overflow-hidden"
        >
          <div className="flex items-stretch min-h-[640px] lg:min-h-[760px]">
            <Sidebar
              activeId={activeId}
              setActiveId={setActiveId}
              notes={notes}
            />

            <section className="flex-1 min-w-0 bg-paper-sunken/30 px-3 sm:px-6 lg:px-10 py-6 sm:py-10 overflow-x-hidden">
              <div key={`${mode}-${activeId}`} className="animate-fade-in">
                {mode === "before" && <ScanView section={activeSection} />}
                {mode === "after" && (
                  <ReadingView
                    section={activeSection}
                    activeHighlights={activeHighlights}
                    toggleHighlight={toggleHighlight}
                    sectionIndex={activeIndex}
                    onViewOriginal={() => setMode("split")}
                  />
                )}
                {mode === "split" && (
                  <SplitView
                    section={activeSection}
                    activeHighlights={activeHighlights}
                    toggleHighlight={toggleHighlight}
                    sectionIndex={activeIndex}
                  />
                )}
              </div>

              {mode !== "split" && (
                <SectionPager
                  activeIndex={activeIndex}
                  setActiveId={setActiveId}
                />
              )}
            </section>

            <NotesPanel
              notes={notes}
              removeNote={removeNote}
              addNote={addNote}
              activeSectionId={activeId}
            />
          </div>
        </div>

      </main>

      <HowItWorks />

      <UserTestingCTA ref={ctaRef} />

      <footer className="max-w-page mx-auto px-4 sm:px-8 pt-2 pb-20 xl:pb-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-2xs text-ink-subtle">
        <div>
          ReadableHTML · prototype · excerpt from{" "}
          <em className="text-ink-muted">The Practice of History</em>{" "}
          (fictional)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-good" />
          <span>All notes saved locally · {notes.length} stored</span>
        </div>
      </footer>

      <MobileBottomBar
        onOpenToc={() => setMobileSheet("toc")}
        onOpenNotes={() => setMobileSheet("notes")}
        noteCount={notes.length}
        sectionTitle={activeSection.title}
        sectionIndex={activeIndex}
        totalSections={sections.length}
      />

      <Drawer
        open={mobileSheet === "toc"}
        onClose={() => setMobileSheet(null)}
        side="left"
        title="Contents"
      >
        <Sidebar
          activeId={activeId}
          setActiveId={setActiveId}
          notes={notes}
          variant="drawer"
          onSelect={() => setMobileSheet(null)}
        />
      </Drawer>

      <Drawer
        open={mobileSheet === "notes"}
        onClose={() => setMobileSheet(null)}
        side="right"
        title="Study Notes"
      >
        <NotesPanel
          notes={notes}
          removeNote={removeNote}
          addNote={addNote}
          activeSectionId={activeId}
          variant="drawer"
        />
      </Drawer>

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onReady={scrollToDemo}
      />
    </div>
  );
}

function SectionPager({
  activeIndex,
  setActiveId,
}: {
  activeIndex: number;
  setActiveId: (id: string) => void;
}) {
  const prev = activeIndex > 0 ? sections[activeIndex - 1] : null;
  const next =
    activeIndex < sections.length - 1 ? sections[activeIndex + 1] : null;

  if (!prev && !next) return null;

  return (
    <div className="mt-12 pt-6 border-t border-line max-w-[760px] mx-auto pl-0 sm:pl-[58px]">
      <div className="grid grid-cols-2 gap-3">
        <PagerCard label="Previous" section={prev} setActiveId={setActiveId} align="left" />
        <PagerCard label="Next" section={next} setActiveId={setActiveId} align="right" />
      </div>
    </div>
  );
}

function PagerCard({
  label,
  section,
  setActiveId,
  align,
}: {
  label: string;
  section: (typeof sections)[number] | null;
  setActiveId: (id: string) => void;
  align: "left" | "right";
}) {
  if (!section) {
    return (
      <div className="rounded-xl border border-dashed border-line px-4 py-3 opacity-50">
        <div className="text-2xs uppercase tracking-eyebrow text-ink-faint">
          {label}
        </div>
        <div className="mt-1 text-[13px] text-ink-faint">—</div>
      </div>
    );
  }
  return (
    <button
      onClick={() => setActiveId(section.id)}
      className={
        align === "left"
          ? "group text-left rounded-xl border border-line bg-paper-raised px-4 py-3 hover:border-accent/40 hover:bg-paper transition-all no-tap-highlight"
          : "group text-right rounded-xl border border-line bg-paper-raised px-4 py-3 hover:border-accent/40 hover:bg-paper transition-all no-tap-highlight"
      }
    >
      <div className="text-2xs uppercase tracking-eyebrow text-ink-faint group-hover:text-accent transition-colors">
        {label}
      </div>
      <div className="mt-1 font-serif text-[14.5px] tracking-tightish text-ink leading-tight">
        {section.title}
      </div>
    </button>
  );
}
