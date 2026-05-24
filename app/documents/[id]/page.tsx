import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DocumentClient } from "./DocumentClient";
import type {
  AnnotationRow,
  DocumentPageRow,
  DocumentRow,
} from "@/lib/documents/types";

export const dynamic = "force-dynamic";

type Supa = ReturnType<typeof createSupabaseServerClient>;

/**
 * Fetch the document row. Tries the full SELECT first (includes
 * `processing_mode`); if the schema doesn't have that column yet (migration
 * 0006 not applied), falls back to the older shape so the page still loads.
 */
async function fetchDocument(
  supabase: Supa,
  id: string,
): Promise<DocumentRow | null> {
  const broad = await supabase
    .from("documents")
    .select(
      "id, user_id, title, storage_path, file_size_bytes, page_count, status, processing_mode, error, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (broad.data) return broad.data as DocumentRow;
  if (broad.error) {
    const basic = await supabase
      .from("documents")
      .select(
        "id, user_id, title, storage_path, file_size_bytes, page_count, status, error, created_at, updated_at",
      )
      .eq("id", id)
      .maybeSingle();
    if (basic.data) {
      return { ...basic.data, processing_mode: null } as DocumentRow;
    }
  }
  return null;
}

/**
 * Fetch document pages. Tries with `page_end` first, falls back without if
 * the column doesn't exist yet.
 */
async function fetchPages(
  supabase: Supa,
  documentId: string,
): Promise<DocumentPageRow[]> {
  const broad = await supabase
    .from("document_pages")
    .select(
      "id, document_id, section_index, section_key, title, page_start, page_end, summary, body, key_terms, created_at",
    )
    .eq("document_id", documentId)
    .order("section_index", { ascending: true });
  if (broad.data) return broad.data as DocumentPageRow[];
  if (broad.error) {
    const basic = await supabase
      .from("document_pages")
      .select(
        "id, document_id, section_index, section_key, title, page_start, summary, body, key_terms, created_at",
      )
      .eq("document_id", documentId)
      .order("section_index", { ascending: true });
    if (basic.data) {
      return basic.data.map((r) => ({ ...r, page_end: null })) as DocumentPageRow[];
    }
  }
  return [];
}

export default async function DocumentPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const doc = await fetchDocument(supabase, params.id);
  if (!doc) notFound();

  const [pages, annotationsRes, originalUrl] = await Promise.all([
    fetchPages(supabase, params.id),
    supabase
      .from("annotations")
      .select(
        "id, user_id, document_id, section_key, kind, text, inline_id, page, meta, created_at",
      )
      .eq("document_id", params.id)
      .order("created_at", { ascending: false }),
    signOriginalUrl(supabase, doc.storage_path),
  ]);

  return (
    <DocumentClient
      document={doc}
      pages={pages}
      initialAnnotations={(annotationsRes.data ?? []) as AnnotationRow[]}
      originalUrl={originalUrl}
    />
  );
}

async function signOriginalUrl(
  supabase: Supa,
  storagePath: string | null,
): Promise<string | null> {
  if (!storagePath) return null;
  try {
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(storagePath, 60 * 30); // 30 min — refreshes per page load
    if (error || !data) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
