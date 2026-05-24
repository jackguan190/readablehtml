import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DashboardClient } from "./DashboardClient";
import type { DocumentRow } from "@/lib/documents/types";
import { getUsageSnapshot, ALPHA_LIMITS } from "@/lib/usage/quota";

export const dynamic = "force-dynamic";

type Supa = ReturnType<typeof createSupabaseServerClient>;

async function fetchDashboardDocuments(supabase: Supa): Promise<DocumentRow[]> {
  const broad = await supabase
    .from("documents")
    .select(
      "id, user_id, title, storage_path, file_size_bytes, page_count, status, processing_mode, error, created_at, updated_at",
    )
    .order("created_at", { ascending: false });
  if (broad.data) return broad.data as DocumentRow[];
  if (broad.error) {
    const basic = await supabase
      .from("documents")
      .select(
        "id, user_id, title, storage_path, file_size_bytes, page_count, status, error, created_at, updated_at",
      )
      .order("created_at", { ascending: false });
    if (basic.data) {
      return basic.data.map((d) => ({ ...d, processing_mode: null })) as DocumentRow[];
    }
  }
  return [];
}

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [documents, usage] = await Promise.all([
    fetchDashboardDocuments(supabase),
    getUsageSnapshot(),
  ]);

  return (
    <DashboardClient
      userEmail={user.email ?? ""}
      userId={user.id}
      initialDocuments={documents}
      usage={
        usage ?? {
          periodStart: "",
          pdfsUploaded: 0,
          aiActions: 0,
          limits: { pdfs: ALPHA_LIMITS.pdfs, ai: ALPHA_LIMITS.ai },
        }
      }
    />
  );
}
