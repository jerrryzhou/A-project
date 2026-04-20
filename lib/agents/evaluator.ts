import { z } from "zod";
import { anthropic, MODEL_CHEAP } from "@/lib/anthropic";
import { zodTool, extractToolInput } from "@/lib/zodFormat";
import type { Tracer } from "./tracer";

const EvalResultSchema = z.object({
  passed: z.boolean(),
  score: z.number().min(1).max(10).describe("Quality score 1-10"),
  feedback: z.string().describe("Specific, actionable feedback if not passed"),
});

export type EvalResult = z.infer<typeof EvalResultSchema>;

export type AgentType = "contact_finder" | "email_generator" | "email_sender";

const EVAL_TOOL = zodTool(
  "evaluate_result",
  "Evaluate the quality of a sub-agent result",
  EvalResultSchema
);

const SYSTEM = `You are a strict quality evaluator for a networking assistant.

contact_finder — Pass (score ≥ 7) when:
- 5 or more contacts returned
- Contacts match the stated goal and target industry/role
- Mix of seniority is appropriate
Fail with actionable feedback otherwise (e.g. "Too few contacts — need 5+", "Results are too junior, need VP/director level").

email_generator — Pass (score ≥ 7) when:
- Email is ≈100 words, has a clear ask, no filler phrases like "hope this finds you well"
- Personalized (references role, company, or shared background)
Fail with specific revision notes (e.g. "Email lacks a clear ask", "Too generic — mention their specific work").

email_sender — Pass if success=true. Fail with the error message otherwise.

Be strict. Generic or low-effort output should fail.`;

export async function evaluate(
  agentType: AgentType,
  result: unknown,
  tracer?: Tracer
): Promise<EvalResult> {
  const t0 = Date.now();
  const response = await anthropic.messages.create({
    model: MODEL_CHEAP,
    max_tokens: 512,
    temperature: 0,
    system: SYSTEM,
    tools: [EVAL_TOOL],
    tool_choice: { type: "tool", name: EVAL_TOOL.name },
    messages: [
      {
        role: "user",
        content: `Evaluate this ${agentType} result:\n\n${JSON.stringify(result, null, 2)}`,
      },
    ],
  });

  const eval_ = extractToolInput(response.content, EvalResultSchema, EVAL_TOOL.name);

  tracer?.log({
    agent: "evaluator",
    model: MODEL_CHEAP,
    tool: EVAL_TOOL.name,
    toolInput: { agentType },
    thought: eval_.feedback,
    result: { passed: eval_.passed, score: eval_.score },
    tokens: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      total: response.usage.input_tokens + response.usage.output_tokens,
    },
    latencyMs: Date.now() - t0,
  });

  return eval_;
}
