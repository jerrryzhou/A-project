import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { anthropic, MODEL_CHEAP, MODEL_FAST, MODEL } from "@/lib/anthropic";
import {
  RawContactSchema,
  RankedResultsSchema,
  OutreachDraftSchema,
  type UserProfile,
  type RankedContact,
  type OutreachDraft,
} from "@/lib/schemas";
import { zodTool } from "@/lib/zodFormat";

// ── Tool Definitions (sent to Claude) ────────────────────────────────────────

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_contacts",
    description:
      "Search for real professionals matching networking criteria. Always call rank_contacts immediately after.",
    input_schema: {
      type: "object" as const,
      properties: {
        goal:       { type: "string", description: "Plain-English networking goal" },
        roles:      { type: "array", items: { type: "string" }, description: "Target job titles" },
        industries: { type: "array", items: { type: "stringf" }, description: "Target industries" },
        locations:  { type: "array", items: { type: "string" }, description: "Cities or regions" },
        keywords:   { type: "array", items: { type: "string" }, description: "Extra keywords" },
      },
      required: ["goal", "roles", "industries", "locations"],
    },
  },
  {
    name: "rank_contacts",
    description: "Rank a contact list by relevance to the user's goal. Returns top 10 with scores and talking points.",
    input_schema: {
      type: "object" as const,
      properties: {
        contacts: { type: "array", items: { type: "object" }, description: "Contacts from search_contacts" },
        goal:     { type: "string" },
      },
      required: ["contacts", "goal"],
    },
  },
  {
    name: "find_email",
    description: "Find the verified work email for a specific person via Hunter.io.",
    input_schema: {
      type: "object" as const,
      properties: {
        first_name: { type: "string" },
        last_name:  { type: "string" },
        company:    { type: "string" },
      },
      required: ["first_name", "last_name", "company"],
    },
  },
  {
    name: "draft_outreach",
    description: "Draft a personalized LinkedIn note (≤300 chars) and email for a contact.",
    input_schema: {
      type: "object" as const,
      properties: {
        name:           { type: "string" },
        title:          { type: "string" },
        company:        { type: "string" },
        why_relevant:   { type: "string" },
        talking_points: { type: "array", items: { type: "string" } },
        goal:           { type: "string" },
      },
      required: ["name", "title", "company", "why_relevant", "goal"],
    },
  },
];

// ── Tool Status Labels ────────────────────────────────────────────────────────

export function getToolLabel(name: string): string {
  return (
    {
      search_contacts: "Searching for contacts…",
      rank_contacts:   "Ranking results…",
      find_email:      "Looking up email…",
      draft_outreach:  "Drafting outreach…",
    }[name] ?? `Running ${name}…`
  );
}

// ── Result Types ──────────────────────────────────────────────────────────────

export type ToolResultData =
  | { type: "contacts"; contacts: RankedContact[] }
  | { type: "email"; name: string; company: string; email: string | null; score: number; source: "hunter" | "unavailable" }
  | { type: "draft"; draft: OutreachDraft };

export type ToolExecResult = {
  result: unknown;
  data?: ToolResultData;
  usage?: { input_tokens: number; output_tokens: number };
  thought?: string;
};

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  userProfile: UserProfile
): Promise<ToolExecResult> {
  switch (name) {
    case "search_contacts": return executeSearch(input, userProfile);
    case "rank_contacts":   return executeRank(input, userProfile);
    case "find_email":      return executeFindEmail(input);
    case "draft_outreach":  return executeDraftOutreach(input, userProfile);
    default: return { result: `Unknown tool: ${name}` };
  }
}

// ── Search ────────────────────────────────────────────────────────────────────

const RawContactListSchema = z.object({ contacts: z.array(RawContactSchema) });
const SEARCH_TOOL = zodTool("return_contacts", "Return matching professionals", RawContactListSchema);

function buildProfileSection(profile: UserProfile): string {
  const parts: string[] = [];
  if (profile.school) {
    const year = profile.graduation_year ? ` (class of ${profile.graduation_year})` : "";
    parts.push(`AT LEAST HALF of contacts must be ${profile.school}${year} alumni.`);
  }
  if (profile.fraternity) parts.push(`Include ${profile.fraternity} members where verifiable.`);
  if (profile.major)      parts.push(`User studied ${profile.major} — prioritize that field.`);
  if (profile.bio)        parts.push(`User bio: "${profile.bio}"`);
  return parts.length ? `\n\n=== PERSONALIZATION ===\n${parts.join("\n")}` : "";
}

async function executeSearch(
  input: Record<string, unknown>,
  profile: UserProfile
): Promise<ToolExecResult> {
  const goal       = input.goal as string;
  const roles      = (input.roles as string[]) ?? [];
  const industries = (input.industries as string[]) ?? [];
  const locations  = (input.locations as string[]) ?? [];
  const keywords   = (input.keywords as string[]) ?? [];

  const response = await anthropic.messages.create({
    model: MODEL_CHEAP,
    max_tokens: 4096,
    system: `You are a networking researcher. Find real professionals matching the criteria. Only include people you are confident exist. Do NOT include linkedin_url.${profile.school ? ` You MUST include ${profile.school} alumni.` : ""}`,
    tools: [SEARCH_TOOL],
    tool_choice: { type: "tool", name: SEARCH_TOOL.name },
    messages: [{
      role: "user",
      content: `Find professionals for: "${goal}"
Roles: ${roles.join(", ")}
Industries: ${industries.join(", ")}
Locations: ${locations.join(", ")}${keywords.length ? `\nKeywords: ${keywords.join(", ")}` : ""}${buildProfileSection(profile)}`,
    }],
  });

  const block = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === SEARCH_TOOL.name
  );
  if (!block) return { result: { contacts: [] } };

  const raw = block.input as Record<string, unknown>;
  let contacts: unknown[] = [];
  if (Array.isArray(raw))               contacts = raw;
  else if (Array.isArray(raw.contacts)) contacts = raw.contacts;
  else contacts = Object.values(raw).find(Array.isArray) ?? [];

  const parsed = RawContactListSchema.parse({ contacts });
  return { result: parsed, usage: response.usage };
}

// ── Rank ──────────────────────────────────────────────────────────────────────

const RANK_TOOL = zodTool("return_ranked", "Return top 10 ranked contacts", RankedResultsSchema);

async function executeRank(
  input: Record<string, unknown>,
  profile: UserProfile
): Promise<ToolExecResult> {
  const contacts = (input.contacts as Array<Record<string, unknown>>) ?? [];
  const goal     = input.goal as string;

  const profileCtx = [
    profile.school     && `School: ${profile.school}`,
    profile.fraternity && `Fraternity: ${profile.fraternity}`,
    profile.major      && `Major: ${profile.major}`,
  ].filter(Boolean).join(", ");

  const contactList = contacts
    .map((c, i) => `${i + 1}. ${c.name} — ${c.title} at ${c.company}${c.location ? ` (${c.location})` : ""}${c.headline ? ` | ${c.headline}` : ""}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: MODEL_FAST,
    max_tokens: 4096,
    system: `You are a networking strategist. Rank the top 10 most valuable contacts for the user's goal. Boost contacts who share the user's school or fraternity — mention it in talking_points.${profileCtx ? ` User background: ${profileCtx}.` : ""}`,
    tools: [RANK_TOOL],
    tool_choice: { type: "tool", name: RANK_TOOL.name },
    messages: [{ role: "user", content: `Goal: ${goal}\n\nContacts:\n${contactList}` }],
  });

  const block = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === RANK_TOOL.name
  );
  if (!block) return { result: { contacts: [], total_searched: contacts.length, criteria_summary: goal } };

  const results = RankedResultsSchema.parse(block.input);
  return {
    result: results,
    data: { type: "contacts", contacts: results.contacts },
    usage: response.usage,
  };
}

// ── Find Email ────────────────────────────────────────────────────────────────

async function executeFindEmail(input: Record<string, unknown>): Promise<ToolExecResult> {
  const firstName = input.first_name as string;
  const lastName  = input.last_name  as string;
  const company   = input.company    as string;
  const name      = `${firstName} ${lastName}`;

  if (!process.env.HUNTER_API_KEY) {
    return {
      result: { error: "Hunter.io not configured. Add HUNTER_API_KEY to .env.local." },
      data: { type: "email", name, company, email: null, score: 0, source: "unavailable" as const },
    };
  }

  const params = new URLSearchParams({
    first_name: firstName,
    last_name:  lastName,
    company,
    api_key: process.env.HUNTER_API_KEY,
  });

  const res  = await fetch(`https://api.hunter.io/v2/email-finder?${params}`);
  const json = await res.json() as { data?: { email: string; score: number } };

  return {
    result: { email: json.data?.email ?? null, score: json.data?.score ?? 0 },
    data: {
      type:    "email",
      name,
      company,
      email:   json.data?.email ?? null,
      source:  "hunter" as const,
      score:   json.data?.score ?? 0,
    },
  };
}

// ── Draft Outreach ────────────────────────────────────────────────────────────

const DRAFT_TOOL = zodTool("return_draft", "Return the outreach draft", OutreachDraftSchema);

async function executeDraftOutreach(
  input: Record<string, unknown>,
  profile: UserProfile
): Promise<ToolExecResult> {
  const senderCtx = [
    profile.name        && `Name: ${profile.name}`,
    profile.school      && `School: ${profile.school}${profile.graduation_year ? ` class of ${profile.graduation_year}` : ""}`,
    profile.fraternity  && `Fraternity: ${profile.fraternity}`,
    profile.bio         && `Bio: ${profile.bio}`,
  ].filter(Boolean).join(", ");

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: `You are a professional outreach email writer. Write concise, human-sounding messages tailored to the recipient.

Rules:
- Professional but natural: polished without being stiff.
- Genuinely personal: reference their role, company, or shared background — nothing generic.
- No clichés: never use "hope this finds you well", "I came across your profile", or AI-sounding filler.
- Clear and concise: every sentence has a purpose; email ≈100 words.
- End with one specific action (e.g. "Would you have 20 min next week?").
- If sender and contact share a school or fraternity, open with it naturally.${senderCtx ? `\n\nSender context: ${senderCtx}.` : ""}`,
    tools: [DRAFT_TOOL],
    tool_choice: { type: "tool", name: DRAFT_TOOL.name },
    messages: [{
      role: "user",
      content: `Goal: ${input.goal}
Contact: ${input.name}, ${input.title} at ${input.company}
Why relevant: ${input.why_relevant}${input.talking_points ? `\nTalking points: ${(input.talking_points as string[]).join("; ")}` : ""}`,
    }],
  });

  const block = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === DRAFT_TOOL.name
  );
  if (!block) throw new Error("Draft tool not called");

  const draft = OutreachDraftSchema.parse(block.input);
  return { result: draft, data: { type: "draft", draft }, usage: response.usage };
}
