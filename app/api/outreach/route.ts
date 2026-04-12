import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODEL } from "@/lib/anthropic";
import { OutreachDraftSchema, UserProfileSchema, type RankedContact, type UserProfile } from "@/lib/schemas";
import { zodTool, extractToolInput } from "@/lib/zodFormat";

const TOOL = zodTool(
  "return_outreach_draft",
  "Return a personalized outreach draft with a LinkedIn note and email",
  OutreachDraftSchema
);

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { contact, goal }: { contact: RankedContact; goal: string } = body;
  const profile: UserProfile = UserProfileSchema.parse(body.userProfile ?? {});

  const senderLines: string[] = [];
  if (profile.name) senderLines.push(`Name: ${profile.name}`);
  if (profile.school) senderLines.push(`School: ${profile.school}${profile.graduation_year ? ` class of ${profile.graduation_year}` : ""}`);
  if (profile.major) senderLines.push(`Major: ${profile.major}`);
  if (profile.fraternity) senderLines.push(`Fraternity/Sorority: ${profile.fraternity}`);
  if (profile.bio) senderLines.push(`Bio: ${profile.bio}`);
  const senderContext = senderLines.length
    ? `\nAbout the sender:\n${senderLines.map(l => `- ${l}`).join("\n")}\n\nIf there is a shared connection (same school, same Greek org, same industry), open with it naturally — it increases response rate dramatically.`
    : "";

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: `You are a networking copywriter. Draft concise, personalized outreach for a professional trying to make a connection.

Rules for LinkedIn note (≤300 chars):
- If there's a shared background (school, fraternity, industry), lead with it
- Reference something specific about their work
- State the ask in one sentence
- No clichés ("I came across your profile", "hope this finds you well")

Rules for email:
- Subject: specific and benefit-forward, not clever
- Body: ~100 words, plain English, clear ask, no fluff
- If there's a shared connection, mention it in the first sentence
- End with a specific proposed action (15-min call, coffee, etc.)`,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [
      {
        role: "user",
        content: `My networking goal: ${goal}${senderContext}

Draft outreach for:
Name: ${contact.name}
Title: ${contact.title} at ${contact.company}
${contact.location ? `Location: ${contact.location}` : ""}
Why I want to meet them: ${contact.why_relevant}
Talking points: ${contact.talking_points.join("; ")}`,
      },
    ],
  });

  try {
    const draft = extractToolInput(response.content, OutreachDraftSchema, TOOL.name);
    return NextResponse.json(draft);
  } catch {
    return NextResponse.json({ error: "Failed to generate outreach" }, { status: 500 });
  }
}
