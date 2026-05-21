import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DashboardClient } from "./DashboardClient";
import type { DocumentRow } from "@/lib/documents/types";
import { getUsageSnapshot, ALPHA_LIMITS } from "@/lib/usage/quota";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [docsRes, usage] = await Promise.all([
    supabase
      .from("documents")
      .select(
        "id, user_id, title, storage_path, file_size_bytes, page_count, status, error, created_at, updated_at",
      )
      .order("created_at", { ascending: false }),
    getUsageSnapshot(),
  ]);

  return (
    <DashboardClient
      userEmail={user.email ?? ""}
      userId={user.id}
      initialDocuments={(docsRes.data ?? []) as DocumentRow[]}
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
