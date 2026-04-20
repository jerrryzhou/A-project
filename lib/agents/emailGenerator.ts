import { executeTool } from "@/lib/agentTools";
import { MODEL } from "@/lib/anthropic";
import type { OutreachDraft, RankedContact, UserProfile } from "@/lib/schemas";
import type { Tracer } from "./tracer";

export type EmailGeneratorResult = {
  draft: OutreachDraft;
  contactName: string;
};

export async function runEmailGenerator(
  contact: RankedContact,
  goal: string,
  userProfile: UserProfile,
  feedback?: string,
  tracer?: Tracer
): Promise<EmailGeneratorResult> {
  const whyRelevant = feedback
    ? `${contact.why_relevant}. Revision feedback: ${feedback}`
    : contact.why_relevant;

  const t0 = Date.now();
  const result = await executeTool(
    "draft_outreach",
    {
      name: contact.name,
      title: contact.title,
      company: contact.company,
      why_relevant: whyRelevant,
      talking_points: contact.talking_points ?? [],
      goal,
    },
    userProfile
  );
  tracer?.log({
    agent: "email_generator",
    model: MODEL,
    tool: "draft_outreach",
    toolInput: { contact: contact.name, goal, feedback },
    result: result.result,
    tokens: {
      input: result.usage?.input_tokens ?? 0,
      output: result.usage?.output_tokens ?? 0,
      total: (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0),
    },
    latencyMs: Date.now() - t0,
  });

  return {
    draft: result.result as OutreachDraft,
    contactName: contact.name,
  };
}
