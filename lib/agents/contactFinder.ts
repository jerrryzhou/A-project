import { anthropic, MODEL_CHEAP, MODEL_FAST } from "@/lib/anthropic";
import { zodTool, extractToolInput } from "@/lib/zodFormat";
import { exaSearch, buildExaQuery, type ExaResult } from "@/lib/exa";
import { executeTool } from "@/lib/agentTools";
import { RawContactSchema } from "@/lib/schemas";
import type { RankedContact, UserProfile } from "@/lib/schemas";
import type { ContactSearchParams } from "./orchestrator";
import type { Tracer } from "./tracer";
import { z } from "zod";

export type ContactFinderResult = {
  contacts: RankedContact[];
  summary: string;
  totalSearched: number;
};

// ── Parse Exa results into structured contacts ────────────────────────────────

const RawContactListSchema = z.object({ contacts: z.array(RawContactSchema) });
const PARSE_TOOL = zodTool(
  "return_contacts",
  "Extract structured professional profiles from search results",
  RawContactListSchema
);

async function parseExaResults(
  results: ExaResult[],
  params: ContactSearchParams,
  userProfile: UserProfile
): Promise<z.infer<typeof RawContactListSchema>> {
  const snippets = results
    .map((r, i) => `${i + 1}. URL: ${r.url}\nTitle: ${r.title}\n${r.text ?? ""}`)
    .join("\n\n");

  const profileHint = userProfile.school
    ? ` Prioritize results that mention ${userProfile.school} alumni.`
    : "";

  const response = await anthropic.messages.create({
    model: MODEL_CHEAP,
    max_tokens: 4096,
    system: `You are a professional data extractor. Extract real people from LinkedIn search results.
Rules:
- Only extract people who are clearly identified in the results
- Extract name, title, company, location from the page title and snippet
- Do NOT invent details not present in the results
- Do NOT include linkedin_url field${profileHint}`,
    tools: [PARSE_TOOL],
    tool_choice: { type: "tool", name: PARSE_TOOL.name },
    messages: [{
      role: "user",
      content: `Extract professionals from these search results for goal: "${params.goal}"\n\n${snippets}`,
    }],
  });

  const raw = extractToolInput(response.content, RawContactListSchema, PARSE_TOOL.name);

  // Normalize — Claude may return array directly or under different key
  let contacts: unknown[] = [];
  if (Array.isArray(raw))                contacts = raw;
  else if (Array.isArray(raw.contacts))  contacts = raw.contacts;
  else contacts = Object.values(raw as object).find(Array.isArray) ?? [];

  return RawContactListSchema.parse({ contacts });
}

// ── Main runner ───────────────────────────────────────────────────────────────

export async function runContactFinder(
  params: ContactSearchParams,
  userProfile: UserProfile,
  feedback?: string,
  tracer?: Tracer
): Promise<ContactFinderResult> {
  const goal = feedback ? `${params.goal}. Improvement required: ${feedback}` : params.goal;

  // ── Step 1: Exa search ──────────────────────────────────────────────────────
  const t0 = Date.now();
  const query = buildExaQuery({ ...params, goal });

  let exaResults: ExaResult[] = [];
  try {
    exaResults = await exaSearch(query, 20);
  } catch (e) {
    // Fall back to Claude-only search if Exa fails
    console.warn("[contactFinder] Exa failed, falling back to Claude:", e);
  }

  tracer?.log({
    agent: "contact_finder",
    model: "exa-neural",
    tool: "exa_search",
    toolInput: { query, goal },
    result: { count: exaResults.length },
    tokens: { input: 0, output: 0, total: 0 },
    latencyMs: Date.now() - t0,
  });

  // ── Step 2: Parse results into structured contacts ──────────────────────────
  let rawContacts: unknown[] = [];

  if (exaResults.length > 0) {
    const t1 = Date.now();
    const parsed = await parseExaResults(exaResults, { ...params, goal }, userProfile);
    rawContacts = parsed.contacts;

    tracer?.log({
      agent: "contact_finder",
      model: MODEL_CHEAP,
      tool: "parse_contacts",
      toolInput: { exaCount: exaResults.length },
      result: { parsed: rawContacts.length },
      tokens: { input: 0, output: 0, total: 0 },
      latencyMs: Date.now() - t1,
    });
  } else {
    // Fallback: Claude generates contacts (old behavior)
    const t1 = Date.now();
    const searchResult = await executeTool(
      "search_contacts",
      { goal, roles: params.roles, industries: params.industries, locations: params.locations, keywords: params.keywords ?? [] },
      userProfile
    );
    const raw = searchResult.result as { contacts: unknown[] };
    rawContacts = raw.contacts ?? [];

    tracer?.log({
      agent: "contact_finder",
      model: MODEL_CHEAP,
      tool: "search_contacts_fallback",
      toolInput: { goal },
      result: { count: rawContacts.length },
      tokens: {
        input:  searchResult.usage?.input_tokens ?? 0,
        output: searchResult.usage?.output_tokens ?? 0,
        total:  (searchResult.usage?.input_tokens ?? 0) + (searchResult.usage?.output_tokens ?? 0),
      },
      latencyMs: Date.now() - t1,
    });
  }

  if (!rawContacts.length) {
    return { contacts: [], summary: "No contacts found", totalSearched: 0 };
  }

  // ── Step 3: Rank ─────────────────────────────────────────────────────────────
  const t2 = Date.now();
  const rankResult = await executeTool("rank_contacts", { contacts: rawContacts, goal }, userProfile);

  tracer?.log({
    agent: "contact_finder",
    model: MODEL_FAST,
    tool: "rank_contacts",
    toolInput: { goal, contactCount: rawContacts.length },
    result: rankResult.result,
    tokens: {
      input:  rankResult.usage?.input_tokens ?? 0,
      output: rankResult.usage?.output_tokens ?? 0,
      total:  (rankResult.usage?.input_tokens ?? 0) + (rankResult.usage?.output_tokens ?? 0),
    },
    latencyMs: Date.now() - t2,
  });

  const ranked = rankResult.result as {
    contacts: RankedContact[];
    total_searched: number;
    criteria_summary: string;
  };

  return {
    contacts: ranked.contacts ?? [],
    summary:  ranked.criteria_summary ?? goal,
    totalSearched: ranked.total_searched ?? rawContacts.length,
  };
}
