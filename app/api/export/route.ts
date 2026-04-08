import { NextRequest, NextResponse } from "next/server";
import type { RankedContact, OutreachDraft } from "@/lib/schemas";

interface ExportRow {
  contact: RankedContact;
  draft: OutreachDraft;
}

function escapeCsv(value: string | undefined): string {
  if (!value) return "";
  // Wrap in quotes and escape any internal quotes
  return `"${value.replace(/"/g, '""')}"`;
}

export async function POST(req: NextRequest) {
  const { rows }: { rows: ExportRow[] } = await req.json();

  if (!rows?.length) {
    return NextResponse.json({ error: "rows array is required" }, { status: 400 });
  }

  const headers = [
    "Rank",
    "Name",
    "Title",
    "Company",
    "Location",
    "LinkedIn URL",
    "Email",
    "Relevance Score",
    "Why Relevant",
    "Talking Points",
    "LinkedIn Note",
    "Email Subject",
    "Email Body",
  ];

  const csvRows = rows.map(({ contact, draft }) =>
    [
      contact.rank,
      escapeCsv(contact.name),
      escapeCsv(contact.title),
      escapeCsv(contact.company),
      escapeCsv(contact.location),
      escapeCsv(contact.linkedin_url),
      escapeCsv(contact.email),
      contact.relevance_score,
      escapeCsv(contact.why_relevant),
      escapeCsv(contact.talking_points.join(" | ")),
      escapeCsv(draft.linkedin_note),
      escapeCsv(draft.email_subject),
      escapeCsv(draft.email_body),
    ].join(",")
  );

  const csv = [headers.join(","), ...csvRows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="networking-contacts-${Date.now()}.csv"`,
    },
  });
}
