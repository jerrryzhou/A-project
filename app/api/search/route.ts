import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { anthropic, MODEL_CHEAP as MODEL } from "@/lib/anthropic";
import { SearchCriteriaSchema, RawContactSchema, UserProfileSchema, type UserProfile } from "@/lib/schemas";
import type Anthropic from "@anthropic-ai/sdk";
import { zodTool } from "@/lib/zodFormat";

const RawContactListSchema = z.object({
  contacts: z.array(RawContactSchema),
});

const EXTRACT_TOOL = zodTool(
  "return_contacts",
  "Return the list of real professionals matching the criteria",
  RawContactListSchema
);

function buildProfileSection(profile: UserProfile): string {
  if (!profile.school && !profile.fraternity && !profile.bio) return "";

  const parts: string[] = [];

  if (profile.school) {
    const year = profile.graduation_year ? ` (class of ${profile.graduation_year})` : "";
    parts.push(`The user attended ${profile.school}${year}. AT LEAST HALF of the contacts you return must be ${profile.school} alumni. This is the single most important filter — a shared alma mater dramatically increases the chance of getting a response.`);
  }

  if (profile.fraternity) {
    parts.push(`The user is a member of ${profile.fraternity}. Include any professionals who are also members of this organization — Greek network connections are extremely warm leads.`);
  }

  if (profile.major) {
    parts.push(`The user studied ${profile.major}, so prioritize contacts who work directly in that field or transitioned from it.`);
  }

  if (profile.bio) {
    parts.push(`User background: "${profile.bio}". Use this to find contacts with a similar trajectory or complementary expertise.`);
  }

  return `\n\n=== PERSONALIZATION — FOLLOW THESE RULES STRICTLY ===\n${parts.join("\n")}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = SearchCriteriaSchema.safeParse(body.criteria);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid criteria" }, { status: 400 });
  }
  const { roles, industries, locations, keywords, meeting_goal } = parsed.data;
  const profile: UserProfile = UserProfileSchema.parse(body.userProfile ?? {});
  const profileSection = buildProfileSection(profile);

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: `You are a professional networking researcher. Your job is to find real professionals that a specific user should reach out to.

Rules:
- Only include people you are confident actually exist
- Include LinkedIn URL when known
- Prefer people with a public profile (press coverage, company pages, LinkedIn)
- Do not invent people${profile.school ? `\n- You MUST include a majority of ${profile.school} alumni in your results` : ""}`,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: EXTRACT_TOOL.name },
      messages: [
        {
          role: "user",
          content: `Find professionals for this networking goal: "${meeting_goal}"

Search criteria:
- Roles: ${roles.join(", ")}
- Industries: ${industries.join(", ")}
- Locations: ${locations.join(", ")}
${keywords.length ? `- Keywords: ${keywords.join(", ")}\n` : ""}${profileSection}

Return 20–30 people. Do NOT include linkedin_url — it will be generated automatically. For anyone who attended the user's school, note it in their headline field (e.g. "Michigan alum, Partner at Sequoia"). Do NOT claim someone was in a specific fraternity unless you have verified public information confirming it.`,
        },
      ],
    });

    const block = response.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === "tool_use" && b.name === EXTRACT_TOOL.name
    );
    if (!block) throw new Error("Claude did not call the expected tool");

    const raw = block.input as Record<string, unknown>;

    // Claude occasionally returns the array directly or under a different key
    let contacts: unknown[] = [];
    if (Array.isArray(raw)) {
      contacts = raw;
    } else if (Array.isArray(raw.contacts)) {
      contacts = raw.contacts;
    } else {
      const firstArray = Object.values(raw).find(Array.isArray);
      if (firstArray) contacts = firstArray;
    }

    const result = RawContactListSchema.parse({ contacts });
    return NextResponse.json({ contacts: result.contacts, total: result.contacts.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[search]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
