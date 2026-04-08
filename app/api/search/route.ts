import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { anthropic, MODEL_CHEAP as MODEL } from "@/lib/anthropic";
import { SearchCriteriaSchema, RawContactSchema } from "@/lib/schemas";
import { zodTool, extractToolInput } from "@/lib/zodFormat";

const RawContactListSchema = z.object({
  contacts: z.array(RawContactSchema),
});

const EXTRACT_TOOL = zodTool(
  "return_contacts",
  "Return the list of real professionals matching the criteria",
  RawContactListSchema
);

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = SearchCriteriaSchema.safeParse(body.criteria);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid criteria" }, { status: 400 });
  }
  const { roles, industries, locations, keywords, meeting_goal } = parsed.data;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: `You are a professional networking researcher with knowledge of business professionals, founders, and executives.

Suggest 20–30 real people who match the given networking criteria. Only include people you are confident actually exist and fit the role. Include their LinkedIn URL if you know it.

Important: prefer well-known or publicly visible professionals — founders who have been featured in press, executives at recognizable companies, investors with public profiles. Do not invent people.`,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: EXTRACT_TOOL.name },
      messages: [
        {
          role: "user",
          content: `Find real professionals matching this networking goal: "${meeting_goal}"

Criteria:
- Roles: ${roles.join(", ")}
- Industries: ${industries.join(", ")}
- Locations: ${locations.join(", ")}
${keywords.length ? `- Keywords: ${keywords.join(", ")}` : ""}

Return 20–30 real people with name, title, company, location, and LinkedIn URL where known.`,
        },
      ],
    });

    const result = extractToolInput(
      response.content,
      RawContactListSchema,
      EXTRACT_TOOL.name
    );

    return NextResponse.json({ contacts: result.contacts, total: result.contacts.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[search]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
