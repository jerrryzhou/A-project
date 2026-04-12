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
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-6 space-y-4">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Your goal</p>
          <p className="text-slate-200 italic">"{goal}"</p>
        </div>

        <div className="border-t border-slate-700/50 pt-4 space-y-3">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Search criteria</p>

          <CriteriaRow label="Roles"      values={criteria.roles}      color="indigo" />
          <CriteriaRow label="Industries" values={criteria.industries} color="violet" />
          <CriteriaRow label="Locations"  values={criteria.locations}  color="sky" />
          <CriteriaRow label="Seniority"  values={criteria.seniority}  color="emerald" />
          {criteria.keywords.length > 0 && (
            <CriteriaRow label="Keywords" values={criteria.keywords}   color="amber" />
          )}

          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Timeframe:</span>
            <span className="text-slate-200">{criteria.timeframe_days} days</span>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 rounded-xl border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 py-3 text-sm font-medium transition-all"
        >
          ← Edit goal
        </button>
        <button
          onClick={() => onConfirm(criteria)}
          className="flex-[2] rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white py-3 text-sm font-semibold transition-all shadow-lg shadow-indigo-900/40"
        >
          Search {criteria.locations[0]} for contacts →
        </button>
      </div>
    </div>
  );
}

const COLOR_MAP: Record<string, string> = {
  indigo:  "bg-indigo-900/50 text-indigo-300 border-indigo-700/60",
  violet:  "bg-violet-900/50 text-violet-300 border-violet-700/60",
  sky:     "bg-sky-900/50 text-sky-300 border-sky-700/60",
  emerald: "bg-emerald-900/50 text-emerald-300 border-emerald-700/60",
  amber:   "bg-amber-900/50 text-amber-300 border-amber-700/60",
};

function CriteriaRow({ label, values, color }: { label: string; values: string[]; color: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-slate-500 text-sm w-20 shrink-0 pt-0.5">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className={`text-xs border rounded-full px-2 py-0.5 ${COLOR_MAP[color] ?? COLOR_MAP.indigo}`}>
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}
