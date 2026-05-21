import type { Section, Inline } from "@/lib/content";

export type DocumentStatus =
  | "uploaded"
  | "queued"
  | "processing"
  | "ready"
  | "failed"
  | "needs_ocr";

export type AnnotationKind = "highlight" | "note" | "quote" | "glossary" | "ai";

export interface DocumentRow {
  id: string;
  user_id: string;
  title: string;
  storage_path: string;
  file_size_bytes: number | null;
  page_count: number | null;
  status: DocumentStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentPageRow {
  id: string;
  document_id: string;
  section_index: number;
  section_key: string;
  title: string;
  page_start: number | null;
  summary: string | null;
  body: { paragraphs: SerializedParagraph[] };
  key_terms: { term: string; def: string }[];
  created_at: string;
}

export interface AnnotationRow {
  id: string;
  user_id: string;
  document_id: string;
  section_key: string;
  kind: AnnotationKind;
  text: string;
  inline_id: string | null;
  page: number | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface SerializedParagraph {
  id: string;
  page?: number;
  dropcap?: boolean;
  inline: Inline[];
}

export function pageRowToSection(row: DocumentPageRow): Section {
  return {
    id: row.section_key,
    title: row.title,
    pageStart: row.page_start ?? 1,
    summary: row.summary ?? "",
    keyTerms: row.key_terms ?? [],
    paragraphs: row.body?.paragraphs ?? [],
  };
}
