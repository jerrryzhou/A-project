"use client";

import { useState } from "react";
import type { RankedContact, OutreachDraft } from "@/lib/schemas";
import { OutreachDraftSchema } from "@/lib/schemas";

interface Props {
  contact: RankedContact;
  goal: string;
  isApproved: boolean;
  onApprove: (contact: RankedContact, draft: OutreachDraft) => void;
}

type DraftState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; draft: OutreachDraft }
  | { status: "error"; message: string };

export function ContactCard({ contact, goal, isApproved, onApprove }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [draftState, setDraftState] = useState<DraftState>({ status: "idle" });

  async function handleDraftOutreach() {
    setExpanded(true);
    setDraftState({ status: "loading" });

    try {
      const res = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact, goal }),
      });

      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
      const parsed = OutreachDraftSchema.safeParse(data);
      if (!parsed.success) throw new Error("Invalid outreach draft format");
      setDraftState({ status: "done", draft: parsed.data });
    } catch (e) {
      setDraftState({ status: "error", message: String(e) });
    }
  }

  const score = contact.relevance_score;
  const scoreColor =
    score >= 8 ? "text-emerald-400" : score >= 6 ? "text-amber-400" : "text-gray-400";

  return (
    <div
      className={`rounded-xl border bg-gray-900 overflow-hidden transition-colors ${
        isApproved ? "border-emerald-700" : "border-gray-800"
      }`}
    >
      {/* Contact header */}
      <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="text-gray-600 text-sm font-mono mt-0.5 w-5 text-right">
            {contact.rank}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-100">{contact.name}</h3>
              {isApproved && (
                <span className="text-xs bg-emerald-900/60 text-emerald-400 border border-emerald-700 rounded-full px-2 py-0.5">
                  Approved
                </span>
              )}
            </div>
            <p className="text-sm text-gray-400">
              {contact.title} · {contact.company}
            </p>
            {contact.location && (
              <p className="text-xs text-gray-600 mt-0.5">{contact.location}</p>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <span className={`text-lg font-bold ${scoreColor}`}>{score}</span>
          <span className="text-gray-600 text-xs">/10</span>
        </div>
      </div>

      {/* Why relevant + talking points */}
      <div className="px-5 pb-4 border-t border-gray-800 pt-3 space-y-3">
        <p className="text-sm text-gray-300">{contact.why_relevant}</p>

        <div className="space-y-1">
          {contact.talking_points.map((point, i) => (
            <p key={i} className="text-xs text-gray-500 flex gap-2">
              <span className="text-gray-700">→</span>
              {point}
            </p>
          ))}
        </div>

        {/* Links */}
        <div className="flex gap-3 text-xs">
          {contact.linkedin_url && (
            <a
              href={`https://${contact.linkedin_url.replace(/^https?:\/\//, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300"
            >
              LinkedIn ↗
            </a>
          )}
          {contact.email && (
            <span className="text-gray-500">{contact.email}</span>
          )}
        </div>

        {/* Draft button */}
        {draftState.status === "idle" && (
          <button
            onClick={handleDraftOutreach}
            className="mt-1 w-full rounded-lg border border-gray-700 hover:border-indigo-600 hover:bg-indigo-950 text-gray-400 hover:text-indigo-300 text-sm py-2 transition-colors"
          >
            Draft outreach message →
          </button>
        )}
      </div>

      {/* Outreach draft panel */}
      {expanded && draftState.status !== "idle" && (
        <OutreachPanel
          state={draftState}
          contact={contact}
          isApproved={isApproved}
          onApprove={(draft) => onApprove(contact, draft)}
        />
      )}
    </div>
  );
}

function OutreachPanel({
  state,
  contact,
  isApproved,
  onApprove,
}: {
  state: Exclude<DraftState, { status: "idle" }>;
  contact: RankedContact;
  isApproved: boolean;
  onApprove: (draft: OutreachDraft) => void;
}) {
  if (state.status === "loading") {
    return (
      <div className="border-t border-gray-800 px-5 py-6 flex items-center gap-3 text-gray-500 text-sm">
        <span className="inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        Drafting outreach…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="border-t border-gray-800 px-5 py-4 text-red-400 text-sm">
        {state.message}
      </div>
    );
  }

  const { draft } = state;

  return (
    <div className="border-t border-gray-800 px-5 py-4 space-y-4">
      <DraftSection
        label={`LinkedIn note (${draft.linkedin_note.length}/300 chars)`}
        content={draft.linkedin_note}
      />
      <DraftSection label="Email subject" content={draft.email_subject} />
      <DraftSection label="Email body" content={draft.email_body} />

      {!isApproved ? (
        <button
          onClick={() => onApprove(draft)}
          className="w-full rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium py-2.5 transition-colors"
        >
          ✓ Approve & add to export
        </button>
      ) : (
        <p className="text-center text-sm text-emerald-400">✓ Added to export</p>
      )}
    </div>
  );
}

function DraftSection({ label, content }: { label: string; content: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
        <button
          onClick={handleCopy}
          className="text-xs text-gray-600 hover:text-gray-300 transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <p className="text-sm text-gray-300 bg-gray-800/60 rounded-lg px-3 py-2 whitespace-pre-wrap">
        {content}
      </p>
    </div>
  );
}
