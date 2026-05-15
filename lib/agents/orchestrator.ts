import { z } from "zod";
import { anthropic, MODEL_CHEAP } from "@/lib/anthropic";
import { zodTool, extractToolInput } from "@/lib/zodFormat";
import type { UserProfile } from "@/lib/schemas";
import type Anthropic from "@anthropic-ai/sdk";
import type { Tracer } from "./tracer";

// ── Parameter schemas for each sub-agent ─────────────────────────────────────

export const ContactSearchParamsSchema = z.object({
  goal: z.string().describe("Plain-English networking goal"),
  roles: z.array(z.string()).describe("Target job titles"),
  industries: z.array(z.string()).describe("Target industries"),
  locations: z.array(z.string()).describe("Cities or regions"),
  keywords: z.array(z.string()).default([]).describe("Extra keywords"),
  count: z.number().int().min(1).max(20).default(10).describe("How many contacts to return — extract from user message if specified, otherwise 10"),
});

export const EmailGenParamsSchema = z.object({
  name: z.string(),
  title: z.string(),
  company: z.string(),
  why_relevant: z.string(),
  talking_points: z.array(z.string()),
  goal: z.string(),
});

export const EmailSendParamsSchema = z.object({
  to: z.string().describe("Recipient email address"),
  name: z.string().describe("Recipient name"),
  subject: z.string(),
  body: z.string(),
});

const OrchestratorPlanSchema = z.object({
  intent: z.enum(["find_contacts", "generate_email", "send_email", "find_and_email", "find_email_and_send", "find_draft_and_send", "general", "clarify"]),
  reasoning: z.string().describe("One sentence explaining the classification"),
  contact_search_params: ContactSearchParamsSchema.optional().describe(
    "Required for find_contacts and find_and_email intents"
  ),
  email_gen_params: z.preprocess(
    (v) => (typeof v === "string" ? undefined : v),
    EmailGenParamsSchema.optional()
  ).describe("Required for generate_email intent when contact details are in the message"),
  email_send_params: z.preprocess(
    (v) => (typeof v === "string" ? undefined : v),
    EmailSendParamsSchema.optional()
  ).describe("Required for send_email intent — only set if all fields are clearly present"),
  general_reply: z.string().optional().describe(
    "Short reply for general intent — no sub-agent needed"
  ),
  clarifying_question: z.string().optional().describe(
    "Required for clarify intent — a single, specific follow-up question to ask the user"
  ),
});

export type OrchestratorPlan = z.infer<typeof OrchestratorPlanSchema>;
export type ContactSearchParams = z.infer<typeof ContactSearchParamsSchema>;
export type EmailGenParams = z.infer<typeof EmailGenParamsSchema>;
export type EmailSendParams = z.infer<typeof EmailSendParamsSchema>;

// ── Orchestrator ──────────────────────────────────────────────────────────────

const PLAN_TOOL = zodTool(
  "plan_actions",
  "Classify the user's intent and extract sub-agent parameters",
  OrchestratorPlanSchema
);

const SYSTEM = `You are an intent classifier for a professional networking assistant.

Intents:
- find_contacts: user wants to find/search for people to network with, with no mention of emailing
- generate_email: user wants to draft OR revise outreach emails. Use this for any request to write, rewrite, improve, or change the tone of emails — even if they say "make it less corny", "redo this", "more professional", "shorter", etc.
- send_email: user explicitly wants to send an already-drafted email to a specific person
- find_and_email: user wants to find contacts AND draft emails but NOT send them
- find_email_and_send: user already has contacts and drafts, and now wants to look up email addresses and send. Use when user says "find their emails and send", "get the emails and send them", "look up emails and send".
- find_draft_and_send: user wants the FULL pipeline in one go — find contacts, draft emails, AND actually send them. Use when the message includes both finding/searching people AND sending (e.g. "find engineers in Chicago and send them a networking email", "search for VCs and email them", "find 5 contacts and reach out").
- clarify: use when the user's request is missing information that would meaningfully change the search. Ask ONE specific question. Use this when:
  * No role or type of person is mentioned (e.g. "find me some contacts", "find 5 people")
  * No industry or goal is clear enough to search effectively
  * The request is ambiguous between very different types of people
  Do NOT clarify just because location is missing — location is optional. Do NOT clarify if you can make a reasonable inference from context or the user's profile.
- general: conversational messages, questions, or anything else. Do NOT use this if the user is asking to change or improve emails.

Extract parameters precisely from the message and conversation history.
Only populate email_send_params if the recipient email address, subject, and body are all clearly available.`;

export async function orchestrate(
  userMessage: string,
  history: Anthropic.MessageParam[],
  userProfile: UserProfile,
  tracer?: Tracer
): Promise<OrchestratorPlan> {
  const profileCtx = [
    userProfile.school && `school: ${userProfile.school}`,
    userProfile.major && `major: ${userProfile.major}`,
    userProfile.bio && `bio: ${userProfile.bio}`,
  ]
    .filter(Boolean)
    .join(", ");

  // Include last 6 turns so the classifier can resolve references like "that first contact"
  const recentHistory = history
    .slice(-6)
    .map((m) => {
      const text =
        typeof m.content === "string"
          ? m.content
          : JSON.stringify(m.content).slice(0, 400);
      return `${m.role}: ${text}`;
    })
    .join("\n");

  const t0 = Date.now();
  const response = await anthropic.messages.create({
    model: MODEL_CHEAP,
    max_tokens: 1024,
    temperature: 0,
    system: SYSTEM,
    tools: [PLAN_TOOL],
    tool_choice: { type: "tool", name: PLAN_TOOL.name },
    messages: [
      {
        role: "user",
        content: [
          recentHistory && `Recent conversation:\n${recentHistory}\n`,
          `Current message: "${userMessage}"`,
          profileCtx && `User profile: ${profileCtx}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });

  const plan = extractToolInput(response.content, OrchestratorPlanSchema, PLAN_TOOL.name);

  tracer?.log({
    agent: "orchestrator",
    model: MODEL_CHEAP,
    thought: plan.reasoning,
    tool: PLAN_TOOL.name,
    toolInput: { userMessage },
    result: { intent: plan.intent },
    tokens: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      total: response.usage.input_tokens + response.usage.output_tokens,
    },
    latencyMs: Date.now() - t0,
  });

  return plan;
}
