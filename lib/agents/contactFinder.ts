import { executeTool } from "@/lib/agentTools";
import { MODEL_CHEAP, MODEL_FAST } from "@/lib/anthropic";
import type { RankedContact, UserProfile } from "@/lib/schemas";
import type { ContactSearchParams } from "./orchestrator";
import type { Tracer } from "./tracer";

export type ContactFinderResult = {
  contacts: RankedContact[];
  summary: string;
  totalSearched: number;
};

export async function runContactFinder(
  params: ContactSearchParams,
  userProfile: UserProfile,
  feedback?: string,
  tracer?: Tracer
): Promise<ContactFinderResult> {
  const goal = feedback ? `${params.goal}. Improvement required: ${feedback}` : params.goal;

  const t0 = Date.now();
  const searchResult = await executeTool(
    "search_contacts",
    { goal, roles: params.roles, industries: params.industries, locations: params.locations, keywords: params.keywords ?? [] },
    userProfile
  );
  tracer?.log({
    agent: "contact_finder",
    model: MODEL_CHEAP,
    tool: "search_contacts",
    toolInput: { goal, roles: params.roles, industries: params.industries, locations: params.locations },
    result: searchResult.result,
    tokens: {
      input: searchResult.usage?.input_tokens ?? 0,
      output: searchResult.usage?.output_tokens ?? 0,
      total: (searchResult.usage?.input_tokens ?? 0) + (searchResult.usage?.output_tokens ?? 0),
    },
    latencyMs: Date.now() - t0,
  });

  const raw = searchResult.result as { contacts: unknown[] };
  if (!raw.contacts?.length) {
    return { contacts: [], summary: "No contacts found", totalSearched: 0 };
  }

  const t1 = Date.now();
  const rankResult = await executeTool("rank_contacts", { contacts: raw.contacts, goal }, userProfile);
  tracer?.log({
    agent: "contact_finder",
    model: MODEL_FAST,
    tool: "rank_contacts",
    toolInput: { goal, contactCount: raw.contacts.length },
    result: rankResult.result,
    tokens: {
      input: rankResult.usage?.input_tokens ?? 0,
      output: rankResult.usage?.output_tokens ?? 0,
      total: (rankResult.usage?.input_tokens ?? 0) + (rankResult.usage?.output_tokens ?? 0),
    },
    latencyMs: Date.now() - t1,
  });

  const ranked = rankResult.result as {
    contacts: RankedContact[];
    total_searched: number;
    criteria_summary: string;
  };

  return {
    contacts: ranked.contacts ?? [],
    summary: ranked.criteria_summary ?? goal,
    totalSearched: ranked.total_searched ?? raw.contacts.length,
  };
}
