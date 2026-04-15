import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface SendEmailBody {
  to:      string;   // recipient email
  name:    string;   // recipient name (for To: header display)
  subject: string;
  body:    string;
}

async function refreshAccessToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  refreshToken: string
): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type:    "refresh_token",
    }),
  });

  const data = await res.json() as { access_token: string; expires_in: number; error?: string };
  if (data.error) throw new Error(`Token refresh failed: ${data.error}`);

  await supabase.from("user_google_tokens").update({
    access_token: data.access_token,
    token_expiry: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    updated_at:   new Date().toISOString(),
  }).eq("user_id", userId);

  return data.access_token;
}

function buildRawEmail(from: string, to: string, name: string, subject: string, body: string): string {
  // RFC 2822 format required by Gmail API
  const message = [
    `From: ${from}`,
    `To: ${name} <${to}>`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    `MIME-Version: 1.0`,
    ``,
    body,
  ].join("\r\n");

  // Base64url encode
  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { to, name, subject, body } = await req.json() as SendEmailBody;

  if (!to || !subject || !body) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Fetch stored tokens
  const { data: tokenRow, error: tokenErr } = await supabase
    .from("user_google_tokens")
    .select("access_token, refresh_token, token_expiry, gmail_email")
    .eq("user_id", user.id)
    .single();

  if (tokenErr || !tokenRow) {
    return NextResponse.json(
      { error: "Gmail not connected. Connect your Gmail account in Profile settings." },
      { status: 400 }
    );
  }

  // Refresh token if expired (or within 60s of expiry)
  let accessToken = tokenRow.access_token;
  const expiry = new Date(tokenRow.token_expiry).getTime();
  if (Date.now() > expiry - 60_000) {
    try {
      accessToken = await refreshAccessToken(supabase, user.id, tokenRow.refresh_token);
    } catch (e) {
      return NextResponse.json(
        { error: "Gmail token expired. Please reconnect your Gmail account." },
        { status: 400 }
      );
    }
  }

  const raw = buildRawEmail(tokenRow.gmail_email, to, name, subject, body);

  const gmailRes = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    }
  );

  if (!gmailRes.ok) {
    const err = await gmailRes.json() as { error?: { message?: string } };
    console.error("[send-email] Gmail API error:", err);
    return NextResponse.json(
      { error: err.error?.message ?? "Failed to send email" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, from: tokenRow.gmail_email });
}
