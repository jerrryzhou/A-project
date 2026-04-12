"use client";

import { useState } from "react";

const EXAMPLES = [
  "I want to meet fintech founders in NYC over the next 30 days",
  "I'm looking to connect with ML engineers at Series A startups in SF",
  "I want to find product managers in the health tech space in Austin",
];

interface Props {
  onSubmit: (goal: string) => void;
}

export function GoalForm({ onSubmit }: Props) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setLoading(true);
    await onSubmit(value.trim());
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="I want to meet founders in the climate tech space in New York over the next 30 days…"
          rows={3}
          className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3 text-slate-100 placeholder-slate-600 focus:border-indigo-500/60 focus:outline-none resize-none"
        />
        <button
          type="submit"
          disabled={!value.trim() || loading}
          className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 transition-all shadow-lg shadow-indigo-900/40"
        >
          {loading ? "Parsing your goal…" : "Find Contacts →"}
        </button>
      </form>

      <div className="space-y-2">
        <p className="text-xs text-slate-500 uppercase tracking-wider">Examples</p>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => setValue(ex)}
            className="block w-full text-left text-sm text-slate-400 hover:text-slate-200 bg-slate-800/40 hover:bg-slate-800 rounded-lg px-3 py-2 transition-colors border border-slate-700/50"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
