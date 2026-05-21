import { sections, type Section } from "@/lib/content";
import type { SerializedParagraph } from "./types";

interface SyntheticPageInput {
  document_id: string;
  section_index: number;
  section_key: string;
  title: string;
  page_start: number;
  summary: string;
  body: { paragraphs: SerializedParagraph[] };
  key_terms: { term: string; def: string }[];
}

export function buildSyntheticPages(documentId: string): SyntheticPageInput[] {
  return sections.map((s: Section, i) => ({
    document_id: documentId,
    section_index: i,
    section_key: s.id,
    title: s.title,
    page_start: s.pageStart,
    summary: s.summary,
    body: { paragraphs: s.paragraphs },
    key_terms: s.keyTerms,
  }));
}
