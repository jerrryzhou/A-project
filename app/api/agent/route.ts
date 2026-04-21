import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL_FAST } from "@/lib/anthropic";
import { UserProfileSchema } from "@/lib/schemas";
import type { RankedContact, UserProfile } from "@/lib/schemas";
import type { ToolResultData } from "@/lib/agentTools";
import { orchestrate, type OrchestratorPlan, type EmailGenParams } from "@/lib/agents/orchestrator";
import { runContactFinder } from "@/lib/agents/contactFinder";
import { runEmailGenerator } from "@/lib/agents/emailGenerator";
import { runEmailSender } from "@/lib/agents/emailSender";
import { evaluate } from "@/lib/agents/evaluator";
import { Tracer, type AgentTrace } from "@/lib/agents/tracer";
import { createClient } from "@/lib/supabase/server";

export type AgentDisplayMessage = {
  id: string;
  role: "user" | "assistant" | "status";
  content: string;
  data?: ToolResultData;
};

export type { AgentTrace };

export type PendingPlan = {
  plan: OrchestratorPlan;
  nextStep: "contact_finder" | "email_generator" | "email_sender" | "done";
  foundContacts?: RankedContact[];
  feedback?: string;
};

const MAX_ATTEMPTS = 3;

// ── Helpers ───────────────────────────────────────────────────────────────────

function isConfirmation(msg: string): boolean {
  return /^(yes|yeah|yep|sure|ok|okay|go|proceed|do it|sounds good|let.?s go|go ahead|confirmed|yup|y)\b/i.test(
    msg.trim()
  );
}

function isRejection(msg: string): boolean {
  return /^(no|nope|cancel|stop|don.?t|skip|never mind|nevermind)\b/i.test(msg.trim());
}

function getFirstStep(intent: OrchestratorPlan["intent"]): PendingPlan["nextStep"] {
  if (intent === "find_contacts" || intent === "find_and_email") return "contact_finder";
  if (intent === "generate_email") return "email_generator";
  return "email_sender";
}

function stepDescription(step: PendingPlan["nextStep"], plan: OrchestratorPlan): string {
  if (step === "contact_finder") {
    const roles = plan.contact_search_params?.roles?.slice(0, 2).join("/") ?? "contacts";
    const locs  = plan.contact_search_params?.locations?.slice(0, 2).join(", ") ?? "your target area";
    return `search for ${roles} in ${locs}`;
  }
  if (step === "email_generator") {
    if (plan.email_gen_params) return `draft an email for ${plan.email_gen_params.name} at ${plan.email_gen_params.company}`;
    return `draft emails for the top 3 contacts`;
  }
  return `send the email to ${plan.email_send_params?.name ?? "the recipient"}`;
}

const STEP_TOOLS: Record<PendingPlan["nextStep"], string[]> = {
  contact_finder:  ["search_contacts", "rank_contacts"],
  email_generator: ["draft_outreach"],
  email_sender:    ["gmail.send"],
  done:            [],
};

function planSummary(intent: OrchestratorPlan["intent"]): string {
  const steps: PendingPlan["nextStep"][] =
    intent === "find_contacts"  ? ["contact_finder"] :
    intent === "generate_email" ? ["email_generator"] :
    intent === "send_email"     ? ["email_sender"] :
    intent === "find_and_email" ? ["contact_finder", "email_generator"] : [];

  return steps
    .map((s) => `${s} (${STEP_TOOLS[s].join(", ")})`)
    .join(" → ");
}

function buildContactFromParams(params: EmailGenParams): RankedContact {
  return {
    rank: 1,
    name: params.name,
    title: params.title,
    company: params.company,
    why_relevant: params.why_relevant,
    talking_points: params.talking_points,
    relevance_score: 8,
  };
}

function uuid() {
  return crypto.randomUUID();
}

// ── Gmail token helper ────────────────────────────────────────────────────────

async function getGmailAccessToken(): Promise<
  { accessToken: string; gmailEmail: string } | { error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: row, error } = await supabase
    .from("user_google_tokens")
    .select("access_token, refresh_token, token_expiry, gmail_email")
    .eq("user_id", user.id)
    .single();

  if (error || !row) return { error: "Gmail not connected" };

  let accessToken = row.access_token;
  if (Date.now() > new Date(row.token_expiry).getTime() - 60_000) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: row.refresh_token,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
      }),
    });
    const data = await res.json() as { access_token: string; expires_in: number; error?: string };
    if (data.error) return { error: "Gmail token expired — please reconnect" };

    await supabase.from("user_google_tokens").update({
      access_token: data.access_token,
      token_expiry: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);

    accessToken = data.access_token;
  }

  return { accessToken, gmailEmail: row.gmail_email };
}

// ── Step executor ─────────────────────────────────────────────────────────────

async function executeStep(
  incoming: PendingPlan,
  userProfile: UserProfile,
  displayMessages: AgentDisplayMessage[],
  apiMessages: Anthropic.MessageParam[],
  tracer: Tracer
): Promise<PendingPlan | null> {
  const { plan, nextStep, foundContacts = [], feedback: planFeedback } = incoming;

  // ── Contact Finder ──────────────────────────────────────────────────────────
  if (nextStep === "contact_finder" && plan.contact_search_params) {
    displayMessages.push({ id: uuid(), role: "status", content: "Searching for contacts…" });

    let contactResult = null;
    let feedback: string | undefined;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      contactResult = await runContactFinder(plan.contact_search_params, userProfile, feedback, tracer);
      const ev = await evaluate("contact_finder", contactResult, tracer);
      if (ev.passed) break;
      feedback = ev.feedback;
      if (i < MAX_ATTEMPTS - 1) {
        displayMessages.push({ id: uuid(), role: "status", content: `Refining search… ${ev.feedback}` });
      }
    }

    if (contactResult?.contacts.length) {
      displayMessages.push({
        id: uuid(), role: "status", content: "",
        data: { type: "contacts", contacts: contactResult.contacts },
      });
      apiMessages.push({
        role: "assistant",
        content: `Found ${contactResult.contacts.length} contacts: ${contactResult.contacts.slice(0, 3).map(c => `${c.name} (${c.title} at ${c.company})`).join(", ")}`,
      });

      if (plan.intent === "find_and_email") {
        displayMessages.push({
          id: uuid(), role: "assistant",
          content: `Found ${contactResult.contacts.length} contacts. Shall I draft emails for all of them?`,
        });
        return { plan, nextStep: "email_generator", foundContacts: contactResult.contacts };
      }

      // For find_contacts: store contacts so follow-up "email these" requests work
      return { plan, nextStep: "done" as PendingPlan["nextStep"], foundContacts: contactResult.contacts };
    } else {
      displayMessages.push({
        id: uuid(), role: "assistant",
        content: "No contacts found. Try adjusting your roles or locations.",
      });
    }

    return null;
  }

  // ── Email Generator ─────────────────────────────────────────────────────────
  if (nextStep === "email_generator") {
    const goal = plan.contact_search_params?.goal ?? plan.email_gen_params?.goal ?? "";
    const targets = plan.intent === "find_and_email"
      ? foundContacts
      : plan.email_gen_params ? [buildContactFromParams(plan.email_gen_params)] : [];

    for (const contact of targets) {
      displayMessages.push({ id: uuid(), role: "status", content: `Drafting email for ${contact.name}…` });

      let emailResult = null;
      let feedback: string | undefined = planFeedback;

      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        emailResult = await runEmailGenerator(contact, goal, userProfile, feedback, tracer);
        const ev = await evaluate("email_generator", emailResult, tracer);
        if (ev.passed) break;
        feedback = ev.feedback;
        if (i < MAX_ATTEMPTS - 1) {
          displayMessages.push({ id: uuid(), role: "status", content: `Improving draft… ${ev.feedback}` });
        }
      }

      if (emailResult) {
        displayMessages.push({ id: uuid(), role: "status", content: "", data: { type: "draft", draft: emailResult.draft } });
        apiMessages.push({ role: "assistant", content: `Drafted email for ${emailResult.contactName}: "${emailResult.draft.email_subject}"` });
      }
    }

    if (!targets.length) {
      displayMessages.push({
        id: uuid(), role: "assistant",
        content: "I need a contact name, title, and company to draft an email. Who would you like to reach out to?",
      });
    }

    return null;
  }

  // ── Email Sender ────────────────────────────────────────────────────────────
  if (nextStep === "email_sender" && plan.email_send_params) {
    displayMessages.push({ id: uuid(), role: "status", content: `Sending email to ${plan.email_send_params.name}…` });

    const tokens = await getGmailAccessToken();
    if ("error" in tokens) {
      displayMessages.push({ id: uuid(), role: "assistant", content: `Couldn't send: ${tokens.error}` });
      return null;
    }

    const result = await runEmailSender({ ...plan.email_send_params, ...tokens });
    displayMessages.push({
      id: uuid(), role: "assistant",
      content: result.success
        ? `Email sent to ${plan.email_send_params.name} from ${result.from}.`
        : `Failed to send: ${result.error}`,
    });
    apiMessages.push({ role: "assistant", content: result.success ? `Email sent to ${plan.email_send_params.name}.` : `Send failed.` });
  }

  return null;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { messages, userMessage, userProfile: rawProfile, pendingPlan: incoming, lastContacts = [] } = body;

  const userProfile = UserProfileSchema.parse(rawProfile ?? {});
  const tracer = new Tracer();
  const displayMessages: AgentDisplayMessage[] = [];
  const apiMessages: Anthropic.MessageParam[] = [
    ...(messages ?? []),
    { role: "user", content: userMessage },
  ];

  // ── Confirmed: execute the pending step ─────────────────────────────────────
  if (incoming && isConfirmation(userMessage)) {
    const next = await executeStep(incoming as PendingPlan, userProfile, displayMessages, apiMessages, tracer);
    const newContacts = next?.foundContacts ?? (incoming as PendingPlan).foundContacts ?? lastContacts;
    return NextResponse.json({ displayMessages, apiMessages, pendingPlan: next, lastContacts: newContacts, trace: tracer.trace });
  }

  // ── Rejected: cancel ────────────────────────────────────────────────────────
  if (incoming && isRejection(userMessage)) {
    displayMessages.push({
      id: uuid(), role: "assistant",
      content: "Cancelled. What would you like to do instead?",
    });
    return NextResponse.json({ displayMessages, apiMessages, pendingPlan: null, lastContacts, trace: tracer.trace });
  }

  // ── New message: classify intent ─────────────────────────────────────────────
  displayMessages.push({ id: uuid(), role: "status", content: "Thinking…" });

  const plan = await orchestrate(userMessage, messages ?? [], userProfile, tracer);

  console.log("[agent] intent:", plan.intent, "| lastContacts:", lastContacts.length, "| email_gen_params:", !!plan.email_gen_params);

  // If user wants to email/draft and we already have contacts from a prior search — skip re-searching
  if (
    (plan.intent === "generate_email" || plan.intent === "find_and_email") &&
    lastContacts.length > 0
  ) {
    const firstStep: PendingPlan["nextStep"] = "email_generator";
    displayMessages.push({
      id: uuid(), role: "assistant",
      content: `I'll draft emails for the ${lastContacts.length} contacts from your last search — shall I proceed?`,
    });
    return NextResponse.json({
      displayMessages,
      apiMessages,
      lastContacts,
      pendingPlan: {
        plan: { ...plan, intent: "find_and_email" as const },
        nextStep: firstStep,
        foundContacts: lastContacts,
        feedback: userMessage,
      } satisfies PendingPlan,
      trace: tracer.trace,
    });
  }

  // General intent — reply directly, no confirmation needed
  if (plan.intent === "general") {
    const reply = plan.general_reply ?? "";
    if (reply) {
      displayMessages.push({ id: uuid(), role: "assistant", content: reply });
      apiMessages.push({ role: "assistant", content: reply });
    } else {
      const response = await anthropic.messages.create({
        model: MODEL_FAST,
        max_tokens: 1024,
        messages: apiMessages,
      });
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      if (text) {
        displayMessages.push({ id: uuid(), role: "assistant", content: text });
        apiMessages.push({ role: "assistant", content: text });
      }
    }
    return NextResponse.json({ displayMessages, apiMessages, pendingPlan: null, trace: tracer.trace });
  }

  // Show plan and ask for confirmation of the first step
  const firstStep = getFirstStep(plan.intent);
  displayMessages.push({
    id: uuid(), role: "assistant",
    content: `${plan.reasoning}\n\nPlan: ${planSummary(plan.intent)}\n\nI'll ${stepDescription(firstStep, plan)} — shall I proceed?`,
  });

  return NextResponse.json({
    displayMessages,
    apiMessages,
    lastContacts,
    pendingPlan: { plan, nextStep: firstStep } satisfies PendingPlan,
    trace: tracer.trace,
  });
}
