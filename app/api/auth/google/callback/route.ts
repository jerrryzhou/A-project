import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get("code");
  const state = searchParams.get("state"); // user.id passed from initiation
  const error = searchParams.get("error");

  const dashboardUrl = new URL("/dashboard", req.url);

  if (error || !code) {
    dashboardUrl.searchParams.set("gmail_error", error ?? "no_code");
    return NextResponse.redirect(dashboardUrl);
  }

  // Verify the user is still logged in and matches the state
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.id !== state) {
    dashboardUrl.searchParams.set("gmail_error", "unauthorized");
    return NextResponse.redirect(dashboardUrl);
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`,
      grant_type:    "authorization_code",
    }),
  });

  const tokens = await tokenRes.json() as {
    access_token:  string;
    refresh_token?: string;
    expires_in:    number;
    error?:        string;
  };

  if (tokens.error || !tokens.access_token) {
    dashboardUrl.searchParams.set("gmail_error", tokens.error ?? "token_exchange_failed");
    return NextResponse.redirect(dashboardUrl);
  }

  // Fetch the Gmail address associated with this Google account
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const userInfo = await userInfoRes.json() as { email?: string };

  const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Upsert into user_google_tokens — update access token always, refresh token only when provided
  const existing = await supabase
    .from("user_google_tokens")
    .select("refresh_token")
    .eq("user_id", user.id)
    .single();

  await supabase.from("user_google_tokens").upsert({
    user_id:       user.id,
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token ?? existing.data?.refresh_token ?? "",
    token_expiry:  tokenExpiry,
    gmail_email:   userInfo.email ?? null,
    updated_at:    new Date().toISOString(),
  });

  dashboardUrl.searchParams.set("gmail", "connected");
  return NextResponse.redirect(dashboardUrl);
}
