"use client";

import { useState } from "react";
import type { SearchCriteria, RankedContact, OutreachDraft } from "@/lib/schemas";
import { GoalForm } from "@/components/GoalForm";
import { CriteriaPreview } from "@/components/CriteriaPreview";
import { ContactCard } from "@/components/ContactCard";

type Step =
  | { id: "input" }
  | { id: "criteria"; criteria: SearchCriteria }
  | { id: "searching"; criteria: SearchCriteria }
  | { id: "ranking"; criteria: SearchCriteria; contactCount: number }
  | { id: "results"; criteria: SearchCriteria; contacts: RankedContact[] };

interface ApprovedEntry {
  contact: RankedContact;
  draft: OutreachDraft;
}

export default function Home() {
  const [goal, setGoal] = useState("");
  const [step, setStep] = useState<Step>({ id: "input" });
  const [approved, setApproved] = useState<ApprovedEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  // ── Step 1 → 2: parse goal ────────────────────────────────────────────────
  async function handleGoalSubmit(userGoal: string) {
    setGoal(userGoal);
    setError(null);
    try {
      const res = await fetch("/api/parse-goal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: userGoal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep({ id: "criteria", criteria: data.criteria });
    } catch (e) {
      setError(String(e));
    }
  }

  // ── Step 2 → 3 → 4: search then rank ─────────────────────────────────────
  async function handleCriteriaConfirm(criteria: SearchCriteria) {
    setError(null);
    setStep({ id: "searching", criteria });

    try {
      // Search Apollo
      const searchRes = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria }),
      });
      const searchData = await searchRes.json();
      if (!searchRes.ok) throw new Error(searchData.error);

      setStep({ id: "ranking", criteria, contactCount: searchData.total });

      // Rank with Claude
      const rankRes = await fetch("/api/rank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: searchData.contacts, goal }),
      });
      const rankData = await rankRes.json();
      if (!rankRes.ok) throw new Error(rankData.error);

      setStep({ id: "results", criteria, contacts: rankData.contacts });
    } catch (e) {
      setError(String(e));
      setStep({ id: "criteria", criteria });
    }
  }

  // ── Step 5: approve a contact + draft ─────────────────────────────────────
  function handleApprove(contact: RankedContact, draft: OutreachDraft) {
    setApproved((prev) => {
      const filtered = prev.filter((a) => a.contact.name !== contact.name);
      return [...filtered, { contact, draft }];
    });
  }

  // ── Export to CSV ─────────────────────────────────────────────────────────
  async function handleExport() {
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: approved }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `networking-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">Networking Agent</h1>
        <p className="text-gray-400 mt-1">
          Tell me who you want to meet — I'll find them, rank them, and write the message.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 rounded-lg bg-red-900/40 border border-red-700 px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Step router */}
      {step.id === "input" && (
        <GoalForm onSubmit={handleGoalSubmit} />
      )}

      {step.id === "criteria" && (
        <CriteriaPreview
          criteria={step.criteria}
          goal={goal}
          onConfirm={handleCriteriaConfirm}
          onBack={() => setStep({ id: "input" })}
        />
      )}

      {step.id === "searching" && (
        <StatusCard message="Searching Apollo for contacts…" />
      )}

      {step.id === "ranking" && (
        <StatusCard
          message={`Found ${step.contactCount} contacts — Claude is ranking the top 10…`}
        />
      )}

      {step.id === "results" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              Top {step.contacts.length} matches
            </h2>
            {approved.length > 0 && (
              <button
                onClick={handleExport}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                Export {approved.length} approved →
              </button>
            )}
          </div>

          {step.contacts.map((contact) => (
            <ContactCard
              key={contact.name}
              contact={contact}
              goal={goal}
              isApproved={approved.some((a) => a.contact.name === contact.name)}
              onApprove={handleApprove}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function StatusCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 px-6 py-8 text-center">
      <div className="inline-block w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-gray-300">{message}</p>
    </div>
  );
}
