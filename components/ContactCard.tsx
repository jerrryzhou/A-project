"use client";

import { useState } from "react";
import type { RankedContact, OutreachDraft, UserProfile } from "@/lib/schemas";
import { OutreachDraftSchema } from "@/lib/schemas";

interface Props {
  contact: RankedContact;
  goal: string;
  userProfile: UserProfile;
  isApproved: boolean;
  onApprove: (contact: RankedContact, draft: OutreachDraft) => void;
}

type DraftState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; draft: OutreachDraft }
  | { status: "error"; message: string };

export function ContactCard({ contact, goal, userProfile, isApproved, onApprove }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [draftState, setDraftState] = useState<DraftState>({ status: "idle" });

  async function handleDraftOutreach() {
    setExpanded(true);
    setDraftState({ status: "loading" });

    try {
      const res = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact, goal, userProfile }),
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
    score >= 8 ? "text-emerald-400" : score >= 6 ? "text-amber-400" : "text-slate-400";

  return (
    <div
      className={`rounded-xl border bg-slate-800/40 overflow-hidden transition-colors ${
        isApproved ? "border-emerald-700/60" : "border-slate-700/50"
      }`}
    >
      {/* Contact header */}
      <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="text-slate-600 text-sm font-mono mt-0.5 w-5 text-right">
            {contact.rank}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-100">{contact.name}</h3>
              {isApproved && (
                <span className="text-xs bg-emerald-900/60 text-emerald-400 border border-emerald-700/50 rounded-full px-2 py-0.5">
                  Approved
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400">
              {contact.title} · {contact.company}
            </p>
            {contact.location && (
              <p className="text-xs text-slate-600 mt-0.5">{contact.location}</p>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <span className={`text-lg font-bold ${scoreColor}`}>{score}</span>
          <span className="text-slate-600 text-xs">/10</span>
        </div>
      </div>

      {/* Why relevant + talking points */}
      <div className="px-5 pb-4 border-t border-slate-700/50 pt-3 space-y-3">
        <p className="text-sm text-slate-300">{contact.why_relevant}</p>

        <div className="space-y-1">
          {contact.talking_points.map((point, i) => (
            <p key={i} className="text-xs text-slate-500 flex gap-2">
              <span className="text-slate-700">→</span>
              {point}
            </p>
          ))}
        </div>

        {/* Links */}
        <div className="flex gap-3 text-xs">
          <a
            href={linkedInSearchUrl(contact.name, contact.company)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300"
          >
            Search LinkedIn ↗
          </a>
          {contact.email && (
            <span className="text-slate-500">{contact.email}</span>
          )}
        </div>

        {/* Draft button */}
        {draftState.status === "idle" && (
          <button
            onClick={handleDraftOutreach}
            className="mt-1 w-full rounded-lg border border-slate-700/50 hover:border-indigo-600/60 hover:bg-indigo-950/40 text-slate-400 hover:text-indigo-300 text-sm py-2 transition-colors"
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

type SendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; from: string }
  | { status: "error"; message: string };

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
  const [sendState, setSendState] = useState<SendState>({ status: "idle" });

  async function handleSend(draft: OutreachDraft) {
    if (!contact.email) return;
    setSendState({ status: "sending" });
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to:      contact.email,
          name:    contact.name,
          subject: draft.email_subject,
          body:    draft.email_body,
        }),
      });
      const data = await res.json() as { success?: boolean; from?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to send");
      setSendState({ status: "sent", from: data.from ?? "" });
    } catch (e) {
      setSendState({ status: "error", message: String(e) });
    }
  }

  if (state.status === "loading") {
    return (
      <div className="border-t border-slate-700/50 px-5 py-6 flex items-center gap-3 text-slate-500 text-sm">
        <span className="inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        Drafting outreach…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="border-t border-slate-700/50 px-5 py-4 text-red-400 text-sm">
        {state.message}
      </div>
    );
  }

  const { draft } = state;

  return (
    <div className="border-t border-slate-700/50 px-5 py-4 space-y-4">
      <DraftSection label="Email subject" content={draft.email_subject} />
      <DraftSection label="Email body" content={draft.email_body} />

      <div className="flex gap-2">
        {!isApproved ? (
          <button
            onClick={() => onApprove(draft)}
            className="flex-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium py-2.5 transition-colors"
          >
            ✓ Approve & add to export
          </button>
        ) : (
          <p className="flex-1 text-center text-sm text-emerald-400 py-2.5">✓ Added to export</p>
        )}

        {/* Send via Gmail — only shown if contact has a verified email */}
        {contact.email && (
          <button
            onClick={() => handleSend(draft)}
            disabled={sendState.status === "sending" || sendState.status === "sent"}
            className={`flex-1 rounded-lg text-sm font-medium py-2.5 transition-colors border
              ${sendState.status === "sent"
                ? "border-emerald-700/40 bg-emerald-900/20 text-emerald-400 cursor-default"
                : sendState.status === "error"
                  ? "border-red-700/40 bg-red-900/20 text-red-400"
                  : "border-indigo-700/50 bg-indigo-900/30 hover:bg-indigo-900/50 text-indigo-300"
              }`}
          >
            {sendState.status === "sending" && (
              <span className="inline-flex items-center gap-2 justify-center w-full">
                <span className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                Sending…
              </span>
            )}
            {sendState.status === "sent"  && `✓ Sent from ${sendState.from}`}
            {sendState.status === "error" && "Retry send ↗"}
            {sendState.status === "idle"  && "Send via Gmail →"}
          </button>
        )}
      </div>

      {sendState.status === "error" && (
        <p className="text-xs text-red-400">{sendState.message}</p>
      )}
    </div>
  );
}

function linkedInSearchUrl(name: string, company: string): string {
  const q = encodeURIComponent(`${name} ${company}`);
  return `https://www.linkedin.com/search/results/people/?keywords=${q}`;
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
        <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
        <button
          onClick={handleCopy}
          className="text-xs text-slate-600 hover:text-slate-300 transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <p className="text-sm text-slate-300 bg-slate-900/50 rounded-lg px-3 py-2 whitespace-pre-wrap">
        {content}
      </p>
    </div>
  );
}
