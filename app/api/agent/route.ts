import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL_FAST } from "@/lib/anthropic";
import { UserProfileSchema } from "@/lib/schemas";
import { AGENT_TOOLS, executeTool, getToolLabel, type ToolResultData } from "@/lib/agentTools";

const SYSTEM_PROMPT = `You are a networking intelligence assistant. Help users find and connect with the right professionals.

Tools:
- search_contacts → find people (always follow immediately with rank_contacts)
- rank_contacts → rank to top 10 with scores and talking points
- find_email → get verified work email via Hunter.io
- draft_outreach → write personalized LinkedIn note + email

Rules:
- When user wants to find people: call search_contacts then rank_contacts in the same turn
- When asked for emails: call find_email for each requested person
- When asked to draft/write a message: call draft_outreach
- Keep text responses SHORT — the UI renders contacts, emails, and drafts visually
- After ranking, briefly say how many were found and ask what they want next
- Be conversational, not robotic`;

export type AgentDisplayMessage = {
  id: string;
  role: "user" | "assistant" | "status";
  content: string;
  data?: ToolResultData;
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { messages, userMessage, userProfile: rawProfile } = body;

  const userProfile = UserProfileSchema.parse(rawProfile ?? {});

  // Build Anthropic message history from prior turns + new user message
  const apiMessages: Anthropic.MessageParam[] = [
    ...(messages ?? []),
    { role: "user", content: userMessage },
  ];

  const displayMessages: AgentDisplayMessage[] = [];
  const MAX_ITERATIONS = 8;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: MODEL_FAST,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: AGENT_TOOLS,
      messages: apiMessages,
    });

    // Any text Claude outputs before/after tool calls
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (text) {
      displayMessages.push({ id: crypto.randomUUID(), role: "assistant", content: text });
    }

    if (response.stop_reason === "end_turn") break;

    if (response.stop_reason === "tool_use") {
      // Add Claude's full response (including tool_use blocks) to history
      apiMessages.push({ role: "assistant", content: response.content });

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        // Show "Searching…" / "Ranking…" etc in the UI
        displayMessages.push({
          id: crypto.randomUUID(),
          role: "status",
          content: getToolLabel(toolUse.name),
        });

        const { result, data } = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          userProfile
        );

        // Attach result data (contacts, email, draft) as a display message
        if (data) {
          displayMessages.push({
            id: crypto.randomUUID(),
            role: "status",
            content: "",
            data,
          });
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      // Feed tool results back to Claude
      apiMessages.push({ role: "user", content: toolResults });
    }
  }

  return NextResponse.json({ displayMessages, apiMessages });
}
