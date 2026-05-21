import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DocumentClient } from "./DocumentClient";
import type {
  AnnotationRow,
  DocumentPageRow,
  DocumentRow,
} from "@/lib/documents/types";

export const dynamic = "force-dynamic";

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

  const { data: doc } = await supabase
    .from("documents")
    .select(
      "id, user_id, title, storage_path, file_size_bytes, page_count, status, error, created_at, updated_at",
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!doc) notFound();

  const [{ data: pages }, { data: annotations }] = await Promise.all([
    supabase
      .from("document_pages")
      .select(
        "id, document_id, section_index, section_key, title, page_start, summary, body, key_terms, created_at",
      )
      .eq("document_id", params.id)
      .order("section_index", { ascending: true }),
    supabase
      .from("annotations")
      .select(
        "id, user_id, document_id, section_key, kind, text, inline_id, page, meta, created_at",
      )
      .eq("document_id", params.id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <DocumentClient
      document={doc as DocumentRow}
      pages={(pages ?? []) as DocumentPageRow[]}
      initialAnnotations={(annotations ?? []) as AnnotationRow[]}
    />
  );
}
