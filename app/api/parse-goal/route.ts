import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODEL_CHEAP as MODEL } from "@/lib/anthropic";
import { SearchCriteriaSchema } from "@/lib/schemas";
import { zodTool, extractToolInput } from "@/lib/zodFormat";

const TOOL = zodTool(
  "extract_search_criteria",
  "Extract structured networking search criteria from the user's plain-English goal",
  SearchCriteriaSchema
);

export async function POST(req: NextRequest) {
  const { goal } = await req.json();
  if (!goal || typeof goal !== "string") {
    return NextResponse.json({ error: "goal is required" }, { status: 400 });
  }

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: `You are a networking assistant. Extract structured search criteria from the user's plain-English networking goal.

Rules:
- Expand role titles to common variations (e.g. "founder" → ["Founder", "Co-Founder", "CEO", "CTO", "Co-CEO"])
- Expand location to name variants (e.g. "NYC" → ["New York City", "New York", "NYC"])
- Map seniority to Apollo values: founder, c_suite, vp, director, manager, senior, entry
- If no timeframe is given, default to 30 days
- Extract any signals about stage/type (YC, Series A, enterprise, etc.) as keywords`,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: goal }],
    });

    const criteria = extractToolInput(response.content, SearchCriteriaSchema, TOOL.name);
    return NextResponse.json({ criteria });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[parse-goal]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
