"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AnnotationKind, AnnotationRow } from "@/lib/documents/types";

type Result<T> = { error: string } | { ok: true; data: T };

async function requireUser() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function createAnnotation(input: {
  documentId: string;
  sectionKey: string;
  kind: AnnotationKind;
  text: string;
  inlineId?: string;
  page?: number;
  meta?: Record<string, unknown>;
}): Promise<Result<AnnotationRow>> {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("annotations")
    .insert({
      user_id: user.id,
      document_id: input.documentId,
      section_key: input.sectionKey,
      kind: input.kind,
      text: input.text,
      inline_id: input.inlineId ?? null,
      page: input.page ?? null,
      meta: input.meta ?? null,
    })
    .select("*")
    .single();

  if (error || !data) return { error: error?.message ?? "Could not save." };

  revalidatePath(`/documents/${input.documentId}`);
  return { ok: true, data: data as AnnotationRow };
}

export async function deleteAnnotation(input: {
  annotationId: string;
  documentId: string;
}): Promise<Result<true>> {
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("annotations")
    .delete()
    .eq("id", input.annotationId);

  if (error) return { error: error.message };
  revalidatePath(`/documents/${input.documentId}`);
  return { ok: true, data: true };
}

export async function toggleHighlightAnnotation(input: {
  documentId: string;
  sectionKey: string;
  inlineId: string;
  text: string;
  page?: number;
}): Promise<Result<{ kind: "added"; row: AnnotationRow } | { kind: "removed" }>> {
  const { supabase, user } = await requireUser();

  const { data: existing } = await supabase
    .from("annotations")
    .select("id")
    .eq("user_id", user.id)
    .eq("document_id", input.documentId)
    .eq("kind", "highlight")
    .eq("inline_id", input.inlineId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("annotations")
      .delete()
      .eq("id", existing.id);
    if (error) return { error: error.message };
    revalidatePath(`/documents/${input.documentId}`);
    return { ok: true, data: { kind: "removed" } };
  }

  const { data, error } = await supabase
    .from("annotations")
    .insert({
      user_id: user.id,
      document_id: input.documentId,
      section_key: input.sectionKey,
      kind: "highlight",
      text: input.text,
      inline_id: input.inlineId,
      page: input.page ?? null,
    })
    .select("*")
    .single();

  if (error || !data) return { error: error?.message ?? "Could not save." };

  revalidatePath(`/documents/${input.documentId}`);
  return { ok: true, data: { kind: "added", row: data as AnnotationRow } };
}
