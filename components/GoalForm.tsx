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
          className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-none"
        />
        <button
          type="submit"
          disabled={!value.trim() || loading}
          className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-3 transition-colors"
        >
          {loading ? "Parsing your goal…" : "Find Contacts →"}
        </button>
      </form>

      <div className="space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-wider">Examples</p>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => setValue(ex)}
            className="block w-full text-left text-sm text-gray-400 hover:text-gray-200 bg-gray-900 hover:bg-gray-800 rounded-lg px-3 py-2 transition-colors"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
