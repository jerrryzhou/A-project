"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LandingPage() {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const supabase = createClient();

    if (tab === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: `${location.origin}/auth/callback`,
        },
      });
      if (error) setError(error.message);
      else setMessage("Check your email for a confirmation link.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else window.location.href = "/dashboard";
    }

    setLoading(false);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05071a] flex items-center justify-center px-4">

      {/* ── Stars ──────────────────────────────────────────────────────────── */}
      <Stars />

      {/* ── Moon ───────────────────────────────────────────────────────────── */}
      <Moon />

      {/* ── Gradient fog at bottom ─────────────────────────────────────────── */}
      <div className="pointer-events-none absolute bottom-0 inset-x-0 h-64
                      bg-gradient-to-t from-[#05071a] to-transparent" />

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="relative z-10 w-full max-w-5xl flex flex-col lg:flex-row
                      items-center justify-between gap-16">

        {/* Left — hero copy */}
        <div className="flex-1 text-center lg:text-left space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30
                          bg-indigo-500/10 px-3 py-1 text-xs text-indigo-300 tracking-widest uppercase">
            AI-powered networking
          </div>

          <h1 className="text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-white">
            Meet the right<br />
            <span className="bg-gradient-to-r from-indigo-400 to-violet-400
                             bg-clip-text text-transparent">
              people faster.
            </span>
          </h1>

          <p className="text-gray-400 text-lg max-w-md mx-auto lg:mx-0 leading-relaxed">
            Tell us who you want to meet. We find them, rank them, and write
            the message — in seconds.
          </p>

          <div className="hidden lg:flex items-center gap-6 text-sm text-gray-500">
            <Stat value="2 min" label="from goal to outreach" />
            <div className="h-8 w-px bg-gray-800" />
            <Stat value="AI-ranked" label="top 10 contacts" />
            <div className="h-8 w-px bg-gray-800" />
            <Stat value="1-click" label="CSV export" />
          </div>
        </div>

        {/* Right — auth card */}
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl
                          shadow-2xl shadow-black/40 p-8 space-y-6">

            {/* Tabs */}
            <div className="flex rounded-xl bg-white/5 p-1 gap-1">
              {(["signin", "signup"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                    tab === t
                      ? "bg-white/10 text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {t === "signin" ? "Sign in" : "Sign up"}
                </button>
              ))}
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {tab === "signup" && (
                <Field
                  label="Full name"
                  type="text"
                  value={name}
                  onChange={setName}
                  placeholder="Alex Johnson"
                />
              )}
              <Field
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
              />
              <Field
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
              />

              {tab === "signin" && (
                <div className="text-right">
                  <button type="button" className="text-xs text-indigo-400 hover:text-indigo-300">
                    Forgot password?
                  </button>
                </div>
              )}

              {error && (
                <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              {message && (
                <p className="text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-800/40 rounded-lg px-3 py-2">
                  {message}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600
                           hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50
                           disabled:cursor-not-allowed text-white font-semibold
                           py-3 transition-all shadow-lg shadow-indigo-900/40"
              >
                {loading ? "Please wait…" : tab === "signin" ? "Sign in →" : "Create account →"}
              </button>
            </form>

            <p className="text-center text-xs text-gray-600">
              {tab === "signin" ? "Don't have an account? " : "Already have an account? "}
              <button
                onClick={() => setTab(tab === "signin" ? "signup" : "signin")}
                className="text-indigo-400 hover:text-indigo-300"
              >
                {tab === "signin" ? "Sign up" : "Sign in"}
              </button>
            </p>
          </div>

          {/* Skip for now */}
          <p className="text-center mt-4 text-xs text-gray-600">
            Just exploring?{" "}
            <Link href="/dashboard" className="text-indigo-400 hover:text-indigo-300">
              Continue without account →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({
  label, type, value, onChange, placeholder,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-gray-400 font-medium">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5
                   text-sm text-gray-100 placeholder-gray-600
                   focus:border-indigo-500/60 focus:outline-none focus:bg-white/8
                   transition-colors"
      />
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-white font-semibold">{value}</p>
      <p className="text-gray-600 text-xs">{label}</p>
    </div>
  );
}

function Moon() {
  return (
    <div className="pointer-events-none absolute -top-32 -right-32 w-[560px] h-[560px]">
      {/* Outer glow */}
      <div className="absolute inset-0 rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, #c7d2fe 0%, transparent 70%)" }} />

      {/* Moon body */}
      <div
        className="absolute inset-8 rounded-full"
        style={{
          background: "radial-gradient(circle at 35% 35%, #f1f5f9, #cbd5e1 40%, #94a3b8 75%, #64748b 100%)",
          boxShadow: "0 0 80px 20px rgba(148,163,184,0.15), inset -20px -20px 40px rgba(0,0,0,0.3)",
        }}
      >
        {/* Craters */}
        <div className="absolute top-[18%] left-[22%] w-14 h-14 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(0,0,0,0.12), transparent 70%)" }} />
        <div className="absolute top-[50%] left-[55%] w-20 h-20 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(0,0,0,0.10), transparent 70%)" }} />
        <div className="absolute top-[68%] left-[28%] w-9 h-9 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(0,0,0,0.15), transparent 70%)" }} />
        <div className="absolute top-[30%] left-[62%] w-7 h-7 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(0,0,0,0.10), transparent 70%)" }} />
        <div className="absolute top-[72%] left-[58%] w-11 h-11 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(0,0,0,0.08), transparent 70%)" }} />

        {/* Shadow side — dark crescent overlay */}
        <div className="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(circle at 72% 60%, rgba(5,7,26,0.55) 30%, transparent 65%)",
          }} />
      </div>
    </div>
  );
}

function Stars() {
  const stars = Array.from({ length: 80 }, (_, i) => ({
    id: i,
    top: `${(i * 37 + 11) % 100}%`,
    left: `${(i * 61 + 7) % 100}%`,
    size: i % 5 === 0 ? 2 : 1,
    opacity: 0.2 + (i % 7) * 0.1,
  }));

  return (
    <div className="pointer-events-none absolute inset-0">
      {stars.map((s) => (
        <div
          key={s.id}
          className="absolute rounded-full bg-white"
          style={{
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            opacity: s.opacity,
          }}
        />
      ))}
    </div>
  );
}
