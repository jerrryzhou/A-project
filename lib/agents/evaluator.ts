import { z } from "zod";
import { anthropic, MODEL_CHEAP } from "@/lib/anthropic";
import { zodTool, extractToolInput } from "@/lib/zodFormat";
import type { Tracer } from "./tracer";

const EvalResultSchema = z.object({
  passed:               z.boolean(),
  score:                z.number().min(1).max(10).describe("Output quality score 1-10"),
  goal_alignment:       z.number().min(1).max(10).describe("How well the output fulfills the original user prompt 1-10"),
  feedback:             z.string().describe("Specific, actionable feedback if not passed"),
  goal_alignment_notes: z.string().describe("One sentence on how well the output matched the user's goal"),
});

export type EvalResult = z.infer<typeof EvalResultSchema>;

export type AgentType = "contact_finder" | "email_generator" | "email_sender";

const EVAL_TOOL = zodTool(
  "evaluate_result",
  "Evaluate the quality of a sub-agent result",
  EvalResultSchema
);

const SYSTEM = `You are a strict quality evaluator for a networking assistant.

For every evaluation, score two things independently:
1. Output quality (score): how well the sub-agent did its job technically
2. Goal alignment (goal_alignment): how well the output fulfills what the user originally asked for

contact_finder — Pass (score ≥ 7 AND goal_alignment ≥ 7) when:
- 5 or more contacts returned
- Contacts match the stated goal and target industry/role
- Mix of seniority is appropriate
- Contacts are clearly relevant to what the user asked for
Fail with actionable feedback otherwise.

email_generator — Pass (score ≥ 7 AND goal_alignment ≥ 7) when:
- Email is ≈100 words, has a clear ask, no filler phrases like "hope this finds you well"
- Personalized (references role, company, or shared background)
- The email's ask directly reflects the user's stated goal (e.g. if user said "ask to work for free", the email must ask that)
Fail with specific revision notes.

email_sender — Pass if success=true. Fail with the error message otherwise.

Be strict. Generic output or output that drifts from the user's goal should fail.`;

export async function evaluate(
  agentType: AgentType,
  result: unknown,
  tracer?: Tracer,
  userGoal?: string
): Promise<EvalResult> {
  const t0 = Date.now();

  const content = [
    userGoal ? `User's original goal: "${userGoal}"` : null,
    `Evaluate this ${agentType} result:\n\n${JSON.stringify(result, null, 2)}`,
  ].filter(Boolean).join("\n\n");

  const response = await anthropic.messages.create({
    model: MODEL_CHEAP,
    max_tokens: 512,
    temperature: 0,
    system: SYSTEM,
    tools: [EVAL_TOOL],
    tool_choice: { type: "tool", name: EVAL_TOOL.name },
    messages: [{ role: "user", content }],
  });

  const eval_ = extractToolInput(response.content, EvalResultSchema, EVAL_TOOL.name);

  tracer?.log({
    agent: "evaluator",
    model: MODEL_CHEAP,
    tool: EVAL_TOOL.name,
    toolInput: { agentType, userGoal },
    thought: `${eval_.feedback} | Goal alignment: ${eval_.goal_alignment}/10 — ${eval_.goal_alignment_notes}`,
    result: { passed: eval_.passed, score: eval_.score, goal_alignment: eval_.goal_alignment },
    tokens: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      total: response.usage.input_tokens + response.usage.output_tokens,
    },
    latencyMs: Date.now() - t0,
  });

  return eval_;
}
