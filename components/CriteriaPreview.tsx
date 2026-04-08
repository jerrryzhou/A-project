"use client";

import type { SearchCriteria } from "@/lib/schemas";

interface Props {
  criteria: SearchCriteria;
  goal: string;
  onConfirm: (criteria: SearchCriteria) => void;
  onBack: () => void;
}

export function CriteriaPreview({ criteria, goal, onConfirm, onBack }: Props) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Your goal</p>
          <p className="text-gray-200 italic">"{goal}"</p>
        </div>

        <div className="border-t border-gray-800 pt-4 space-y-3">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Search criteria</p>

          <CriteriaRow label="Roles" values={criteria.roles} color="indigo" />
          <CriteriaRow label="Industries" values={criteria.industries} color="violet" />
          <CriteriaRow label="Locations" values={criteria.locations} color="sky" />
          <CriteriaRow label="Seniority" values={criteria.seniority} color="emerald" />
          {criteria.keywords.length > 0 && (
            <CriteriaRow label="Keywords" values={criteria.keywords} color="amber" />
          )}

          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Timeframe:</span>
            <span className="text-gray-200">{criteria.timeframe_days} days</span>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 rounded-xl border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 py-3 text-sm font-medium transition-colors"
        >
          ← Edit goal
        </button>
        <button
          onClick={() => onConfirm(criteria)}
          className="flex-2 flex-grow rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white py-3 text-sm font-medium transition-colors"
        >
          Search {criteria.locations[0]} for contacts →
        </button>
      </div>
    </div>
  );
}

const COLOR_MAP: Record<string, string> = {
  indigo: "bg-indigo-900/50 text-indigo-300 border-indigo-700",
  violet: "bg-violet-900/50 text-violet-300 border-violet-700",
  sky: "bg-sky-900/50 text-sky-300 border-sky-700",
  emerald: "bg-emerald-900/50 text-emerald-300 border-emerald-700",
  amber: "bg-amber-900/50 text-amber-300 border-amber-700",
};

function CriteriaRow({ label, values, color }: { label: string; values: string[]; color: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-gray-500 text-sm w-20 shrink-0 pt-0.5">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className={`text-xs border rounded-full px-2 py-0.5 ${COLOR_MAP[color] ?? COLOR_MAP.indigo}`}
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}
