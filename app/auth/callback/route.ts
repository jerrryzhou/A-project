import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Supabase redirects here after email confirmation
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);

    // Check if this user already has a profile
    const { data: { user } } = await supabase.auth.getUser();
    if (user && !next) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("user_id")
        .eq("user_id", user.id)
        .single();

      // New user — send to onboarding
      if (!profile) {
        return NextResponse.redirect(new URL("/onboarding", request.url));
      }
    }
  }

  return NextResponse.redirect(new URL(next ?? "/dashboard", request.url));
}
