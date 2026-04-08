import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODEL_FAST as MODEL } from "@/lib/anthropic";
import { RankedResultsSchema, type RawContact } from "@/lib/schemas";
import { zodTool, extractToolInput } from "@/lib/zodFormat";

const TOOL = zodTool(
  "return_ranked_contacts",
  "Return the top 10 ranked contacts with relevance scores and talking points",
  RankedResultsSchema
);

export async function POST(req: NextRequest) {
  const { contacts, goal }: { contacts: RawContact[]; goal: string } = await req.json();

  if (!contacts?.length) {
    return NextResponse.json({ error: "contacts array is required" }, { status: 400 });
  }

  const contactList = contacts
    .map(
      (c, i) =>
        `${i + 1}. ${c.name} — ${c.title} at ${c.company}` +
        `${c.location ? ` (${c.location})` : ""}` +
        `${c.company_industry ? ` | ${c.company_industry}` : ""}`
    )
    .join("\n");

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: `You are a networking strategist. Given a list of professionals and the user's networking goal, select and rank the top 10 most valuable people to meet.

Ranking criteria:
1. Relevance to the stated goal (most important)
2. Seniority and decision-making power
3. Mutual benefit potential
4. Quality of talking points you can generate

For each contact provide a relevance_score 1–10, 1–2 sentences on WHY they are worth meeting, and 2–3 concrete talking points referencing their specific company/role.`,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [
      {
        role: "user",
        content: `My networking goal: ${goal}\n\nContacts to rank (${contacts.length} total):\n\n${contactList}`,
      },
    ],
  });

  try {
    const results = extractToolInput(response.content, RankedResultsSchema, TOOL.name);

    // Hydrate linkedin/email/location from the original contact list
    const hydrated = results.contacts.map((ranked) => {
      const original = contacts.find((c) => c.name === ranked.name);
      return {
        ...ranked,
        linkedin_url: ranked.linkedin_url ?? original?.linkedin_url,
        email: ranked.email ?? original?.email,
        location: ranked.location ?? original?.location,
      };
    });

    return NextResponse.json({ ...results, contacts: hydrated });
  } catch {
    return NextResponse.json({ error: "Ranking failed" }, { status: 500 });
  }
}
