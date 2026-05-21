"use client";

import Link from "next/link";
import { BookOpen, Github, Moon, Sun, Menu, Upload, LayoutGrid } from "lucide-react";
import { Button } from "./ui/Button";
import { ViewToggle, type ViewMode } from "./ViewToggle";

interface Props {
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  onOpenMobileToc?: () => void;
  onUpload?: () => void;
  userEmail?: string | null;
}

export function TopBar({
  mode,
  setMode,
  theme,
  toggleTheme,
  onOpenMobileToc,
  onUpload,
  userEmail,
}: Props) {
  const isAuthed = !!userEmail;
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-paper-sunken/75 border-b border-line">
      <div className="max-w-page mx-auto h-14 px-3 sm:px-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {onOpenMobileToc && (
            <button
              onClick={onOpenMobileToc}
              className="lg:hidden -ml-1 h-9 w-9 grid place-items-center rounded-md hover:bg-paper-sunken text-ink-muted hover:text-ink no-tap-highlight transition-colors"
              aria-label="Open contents"
            >
              <Menu className="h-4 w-4" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-ink text-paper grid place-items-center shadow-soft">
              <BookOpen className="h-4 w-4" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-semibold tracking-tightish text-[15px]">
                Readable
                <span className="text-accent">HTML</span>
              </span>
              <span className="text-2xs text-ink-subtle hidden sm:inline">
                · alpha
              </span>
            </div>
          </div>
        </div>

        <div className="hidden md:block">
          <ViewToggle mode={mode} setMode={setMode} />
        </div>

        <div className="flex items-center gap-1.5">
          {isAuthed ? (
            <Link
              href="/dashboard"
              className="hidden md:inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-line bg-paper text-ink text-xs font-medium hover:border-accent/50 hover:bg-paper-raised transition-colors no-tap-highlight"
            >
              <LayoutGrid className="h-3.5 w-3.5 text-accent" />
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden sm:inline-flex items-center h-8 px-2.5 rounded-md text-ink-muted hover:text-ink text-xs font-medium transition-colors no-tap-highlight"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="hidden md:inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-line bg-paper text-ink text-xs font-medium hover:border-accent/50 hover:bg-paper-raised transition-colors no-tap-highlight"
              >
                <Upload className="h-3.5 w-3.5 text-accent" />
                Sign up
              </Link>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Source"
            title="Source"
            className="hidden sm:inline-flex"
          >
            <Github className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="md:hidden border-t border-line bg-paper-sunken/85">
        <div className="max-w-page mx-auto px-3 py-2 flex justify-center">
          <ViewToggle mode={mode} setMode={setMode} />
        </div>
      </div>
    </header>
  );
}
