"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const STEPS = ["intro", "education", "about", "links"] as const;
type Step = (typeof STEPS)[number];

export default function OnboardingPage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [animating, setAnimating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [school, setSchool] = useState("");
  const [major, setMajor] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [bio, setBio] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [fraternity, setFraternity] = useState("");

  // Pre-fill name from Supabase user
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace("/"); return; }
      setName(data.user.user_metadata?.name ?? "");
    });
  }, [router]);

  function goTo(newIndex: number) {
    if (animating || newIndex < 0 || newIndex >= STEPS.length) return;
    setDirection(newIndex > stepIndex ? "forward" : "back");
    setAnimating(true);
    setTimeout(() => {
      setStepIndex(newIndex);
      setAnimating(false);
    }, 280);
  }

  async function handleFinish() {
    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/"); return; }

    // Update name in users table
    if (name) {
      await supabase.from("users").update({ name }).eq("id", user.id);
    }

    // Insert profile
    const { error: profileError } = await supabase.from("user_profiles").upsert({
      user_id: user.id,
      school,
      major,
      graduation_year: gradYear ? parseInt(gradYear) : null,
      linkedin_url: linkedin || null,
      bio: bio || null,
      fraternity: fraternity || null,
    }, { onConflict: "user_id" });

    if (profileError) {
      setError(profileError.message);
      setSubmitting(false);
      return;
    }

    router.push("/dashboard");
  }

  const step = STEPS[stepIndex];
  const progress = ((stepIndex) / (STEPS.length - 1)) * 100;

  return (
    <div className="relative min-h-screen bg-[#05071a] flex flex-col items-center justify-center px-4 overflow-hidden">
      <Stars />

      {/* Progress bar */}
      <div className="relative z-10 w-full max-w-md mb-8">
        <div className="flex justify-between text-xs text-gray-500 mb-2">
          <span>Step {stepIndex + 1} of {STEPS.length}</span>
          <span>{Math.round(progress)}% complete</span>
        </div>
        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-md">
        <div
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl shadow-black/40 p-8"
          style={{
            transform: animating
              ? `translateX(${direction === "forward" ? "-60px" : "60px"})`
              : "translateX(0)",
            opacity: animating ? 0 : 1,
            transition: "transform 280ms ease, opacity 280ms ease",
          }}
        >
          {step === "intro" && (
            <StepIntro name={name} setName={setName} />
          )}
          {step === "education" && (
            <StepEducation
              school={school} setSchool={setSchool}
              major={major} setMajor={setMajor}
              gradYear={gradYear} setGradYear={setGradYear}
            />
          )}
          {step === "about" && (
            <StepAbout bio={bio} setBio={setBio} />
          )}
          {step === "links" && (
            <StepLinks
              linkedin={linkedin} setLinkedin={setLinkedin}
              fraternity={fraternity} setFraternity={setFraternity}
            />
          )}

          {error && (
            <p className="mt-4 text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Navigation */}
          <div className="mt-8 flex gap-3">
            {stepIndex > 0 && (
              <button
                onClick={() => goTo(stepIndex - 1)}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10
                           text-gray-300 font-medium py-3 transition-all text-sm"
              >
                ← Back
              </button>
            )}
            {stepIndex < STEPS.length - 1 ? (
              <button
                onClick={() => {
                  if (!canAdvance(step, { name, school, major, gradYear })) return;
                  goTo(stepIndex + 1);
                }}
                disabled={!canAdvance(step, { name, school, major, gradYear })}
                className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600
                           hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40
                           disabled:cursor-not-allowed text-white font-semibold py-3 transition-all
                           shadow-lg shadow-indigo-900/40 text-sm"
              >
                Continue →
              </button>
            ) : (
              <button
                onClick={handleFinish}
                disabled={submitting || !canAdvance(step, { name, school, major, gradYear })}
                className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600
                           hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40
                           disabled:cursor-not-allowed text-white font-semibold py-3 transition-all
                           shadow-lg shadow-indigo-900/40 text-sm"
              >
                {submitting ? "Saving…" : "Let's go →"}
              </button>
            )}
          </div>

          {/* Skip (last step only) */}
          {stepIndex === STEPS.length - 1 && (
            <button
              onClick={() => router.push("/dashboard")}
              className="w-full mt-3 text-center text-xs text-gray-600 hover:text-gray-400 transition-colors"
            >
              Skip for now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Validation ────────────────────────────────────────────────────────────────

function canAdvance(
  step: Step,
  vals: { name: string; school: string; major: string; gradYear: string }
) {
  if (step === "intro") return vals.name.trim().length > 0;
  if (step === "education")
    return vals.school.trim().length > 0 && vals.major.trim().length > 0 && vals.gradYear.trim().length > 0;
  return true; // about + links are optional
}

// ── Steps ─────────────────────────────────────────────────────────────────────

function StepIntro({ name, setName }: { name: string; setName: (v: string) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-2xl mb-1">👋</div>
        <h2 className="text-xl font-bold text-white">What should we call you?</h2>
        <p className="text-sm text-gray-500 mt-1">This is how you'll appear to others.</p>
      </div>
      <Field label="Full name" type="text" value={name} onChange={setName} placeholder="Alex Johnson" autoFocus />
    </div>
  );
}

function StepEducation({
  school, setSchool, major, setMajor, gradYear, setGradYear,
}: {
  school: string; setSchool: (v: string) => void;
  major: string; setMajor: (v: string) => void;
  gradYear: string; setGradYear: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-2xl mb-1">🎓</div>
        <h2 className="text-xl font-bold text-white">Your education</h2>
        <p className="text-sm text-gray-500 mt-1">Helps us find relevant alumni and peers.</p>
      </div>
      <div className="space-y-4">
        <Field label="School" type="text" value={school} onChange={setSchool} placeholder="University of Michigan" autoFocus />
        <Field label="Major" type="text" value={major} onChange={setMajor} placeholder="Computer Science" />
        <Field label="Graduation year" type="number" value={gradYear} onChange={setGradYear} placeholder="2026" />
      </div>
    </div>
  );
}

function StepAbout({ bio, setBio }: { bio: string; setBio: (v: string) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-2xl mb-1">✍️</div>
        <h2 className="text-xl font-bold text-white">Tell us about yourself</h2>
        <p className="text-sm text-gray-500 mt-1">A short bio helps AI personalize your outreach. Optional.</p>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs text-gray-400 font-medium">Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="I'm a junior studying CS, interested in fintech and SaaS startups…"
          rows={4}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5
                     text-sm text-gray-100 placeholder-gray-600 resize-none
                     focus:border-indigo-500/60 focus:outline-none transition-colors"
        />
        <p className="text-right text-xs text-gray-600">{bio.length}/300</p>
      </div>
    </div>
  );
}

function StepLinks({
  linkedin, setLinkedin, fraternity, setFraternity,
}: {
  linkedin: string; setLinkedin: (v: string) => void;
  fraternity: string; setFraternity: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-2xl mb-1">🔗</div>
        <h2 className="text-xl font-bold text-white">Stay connected</h2>
        <p className="text-sm text-gray-500 mt-1">Optional — add your LinkedIn and Greek affiliation.</p>
      </div>
      <div className="space-y-4">
        <Field label="LinkedIn URL" type="url" value={linkedin} onChange={setLinkedin} placeholder="https://linkedin.com/in/yourname" />
        <Field label="Fraternity / Sorority" type="text" value={fraternity} onChange={setFraternity} placeholder="Alpha Beta Gamma" />
      </div>
    </div>
  );
}

// ── Shared ────────────────────────────────────────────────────────────────────

function Field({
  label, type, value, onChange, placeholder, autoFocus,
}: {
  label: string; type: string; value: string;
  onChange: (v: string) => void; placeholder: string; autoFocus?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-gray-400 font-medium">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5
                   text-sm text-gray-100 placeholder-gray-600
                   focus:border-indigo-500/60 focus:outline-none focus:bg-white/8
                   transition-colors"
      />
    </div>
  );
}

function Stars() {
  const stars = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    top: `${(i * 37 + 11) % 100}%`,
    left: `${(i * 61 + 7) % 100}%`,
    size: i % 5 === 0 ? 2 : 1,
    opacity: 0.15 + (i % 7) * 0.08,
  }));

  return (
    <div className="pointer-events-none absolute inset-0">
      {stars.map((s) => (
        <div
          key={s.id}
          className="absolute rounded-full bg-white"
          style={{ top: s.top, left: s.left, width: s.size, height: s.size, opacity: s.opacity }}
        />
      ))}
    </div>
  );
}
