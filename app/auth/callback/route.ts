import { NextResponse } from "next/server";
import { callbackDestination } from "@/lib/nebu/callback-destination";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(callbackDestination(origin, next));
    }
  }

  return NextResponse.redirect(`${origin}/login?error=callback_failed`);
}
