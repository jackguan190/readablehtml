import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Section } from "./content";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sectionWordCount(section: Section): number {
  return section.paragraphs.reduce((sum, p) => {
    return (
      sum +
      p.inline.reduce((s, i) => {
        const text = "text" in i ? i.text : i.term;
        return s + text.trim().split(/\s+/).filter(Boolean).length;
      }, 0)
    );
  }, 0);
}

export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 230));
}

export function sectionPageRange(section: Section): { start: number; end: number } {
  const pages = section.paragraphs
    .map((p) => p.page)
    .filter((p): p is number => typeof p === "number");
  if (pages.length === 0) return { start: section.pageStart, end: section.pageStart };
  return { start: Math.min(...pages), end: Math.max(...pages) };
}
