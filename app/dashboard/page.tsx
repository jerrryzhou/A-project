"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { RankedContact, OutreachDraft, UserProfile } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/client";
import type { AgentDisplayMessage } from "@/app/api/agent/route";

// ── Types ─────────────────────────────────────────────────────────────────────

type View = "chat" | "contacts" | "profile";

interface SavedContact {
  id: string;
  name: string;
  title: string;
  company: string;
  location?: string;
  linkedin_url?: string;
  email?: string;
  relevance_score?: number;
  status: string;
  notes?: string;
  email_subject?: string;
  email_body?: string;
  created_at: string;
}

type FullProfile = UserProfile & { name?: string };

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<View>("chat");
  const [userProfile, setUserProfile] = useState<FullProfile>({});
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [gmailToast, setGmailToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    const gmailParam = searchParams.get("gmail");
    const gmailError = searchParams.get("gmail_error");
    if (gmailParam === "connected") {
      setGmailToast({ type: "success", message: "Gmail connected successfully!" });
      setView("profile");
      setTimeout(() => setGmailToast(null), 4000);
    } else if (gmailError) {
      setGmailToast({ type: "error", message: `Gmail connection failed: ${gmailError}` });
      setView("profile");
      setTimeout(() => setGmailToast(null), 5000);
    }
  }, [searchParams]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace("/"); return; }
      const [{ data: profile }, { data: userRow }] = await Promise.all([
        supabase.from("user_profiles")
          .select("school, major, graduation_year, bio, fraternity, linkedin_url")
          .eq("user_id", data.user.id).single(),
        supabase.from("users").select("name").eq("id", data.user.id).single(),
      ]);
      setUserProfile({ ...(profile ?? {}), name: userRow?.name ?? undefined });
      setProfileLoaded(true);
    });
  }, [router]);

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden">
      <Sidebar view={view} setView={setView} userName={userProfile.name} />
      <main className="flex-1 overflow-auto">
        {view === "chat" && profileLoaded && (
          <ChatView userProfile={userProfile} />
        )}
        {view === "contacts" && <ContactsView />}
        {view === "profile" && profileLoaded && (
          <ProfileView profile={userProfile} onSave={setUserProfile} />
        )}
      </main>

      {/* Gmail connection toast */}
      {gmailToast && (
        <div className={`fixed bottom-6 right-6 z-50 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur
          ${gmailToast.type === "success"
            ? "bg-emerald-900/80 border-emerald-700/60 text-emerald-200"
            : "bg-red-900/80 border-red-700/60 text-red-200"}`}>
          {gmailToast.message}
        </div>
      )}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ view, setView, userName }: {
  view: View;
  setView: (v: View) => void;
  userName?: string;
}) {
  const router = useRouter();

  const nav: { id: View; label: string; icon: React.ReactNode }[] = [
    { id: "chat",     label: "Search",   icon: <SearchIcon /> },
    { id: "contacts", label: "Contacts", icon: <ContactsIcon /> },
    { id: "profile",  label: "Profile",  icon: <ProfileIcon /> },
  ];

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <aside className="w-56 shrink-0 flex flex-col border-r border-slate-700/50 bg-slate-900">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-700/50">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-sm">
            🌙
          </div>
          <span className="font-semibold text-sm text-slate-100">NetAgent</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              view === item.id
                ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <span className={view === item.id ? "text-indigo-400" : "text-slate-500"}>
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-slate-700/50 space-y-1">
        <div className="px-3 py-2">
          <p className="text-xs font-medium text-slate-300 truncate">{userName ?? "—"}</p>
          <p className="text-xs text-slate-500">Free plan</p>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all"
        >
          <SignOutIcon /> Sign out
        </button>
      </div>
    </aside>
  );
}

// ── Chat View ─────────────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  "Find VCs in NYC who invest in SaaS",
  "Connect with ML engineers at AI startups in SF",
  "Meet fintech founders in my network",
];

function ChatView({ userProfile }: { userProfile: FullProfile }) {
  const firstName = userProfile.name?.split(" ")[0];
  const [messages, setMessages] = useState<AgentDisplayMessage[]>([{
    id: "welcome",
    role: "assistant",
    content: firstName
      ? `Hey ${firstName} — who do you want to connect with?`
      : "Who do you want to connect with? Describe your ideal contact.",
  }]);
  const [apiMessages, setApiMessages] = useState<unknown[]>([]);
  const [pendingPlan, setPendingPlan] = useState<unknown>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailMap, setEmailMap] = useState<Record<string, string>>({}); // name → email
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSend(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput("");
    setLoading(true);

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: msg },
    ]);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, userMessage: msg, userProfile, pendingPlan }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, ...data.displayMessages]);
      setApiMessages(data.apiMessages);
      setPendingPlan(data.pendingPlan ?? null);

      // Extract any newly found emails and add to emailMap
      const newEmails: Record<string, string> = {};
      for (const m of data.displayMessages as AgentDisplayMessage[]) {
        if (m.data?.type === "email" && m.data.email) {
          newEmails[m.data.name] = m.data.email;
        }
      }
      if (Object.keys(newEmails).length > 0) {
        setEmailMap((prev) => ({ ...prev, ...newEmails }));
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-slate-700/50">
        <h1 className="text-lg font-semibold text-slate-100">Networking Agent</h1>
        <p className="text-xs text-slate-500">AI-powered contact search and outreach</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} emailMap={emailMap} userProfile={userProfile} />
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-slate-500 text-sm py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "120ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "240ms" }} />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-slate-700/50 px-6 py-4">
        {/* Quick prompts — only on first message */}
        {messages.length === 1 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => handleSend(p)}
                className="text-xs text-slate-500 hover:text-slate-300 border border-slate-700/50 hover:border-slate-600 rounded-lg px-3 py-1.5 transition-all"
              >
                {p}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Find contacts, get emails, draft messages…"
            disabled={loading}
            className="flex-1 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3 text-sm
                       text-slate-100 placeholder-slate-600 focus:border-indigo-500/60 focus:outline-none
                       disabled:opacity-50 transition-colors"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600
                       hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40
                       text-white font-semibold text-sm transition-all"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Message Renderer ──────────────────────────────────────────────────────────

function ChatMessage({ message, emailMap, userProfile }: {
  message: AgentDisplayMessage;
  emailMap: Record<string, string>;
  userProfile: FullProfile;
}) {
  const { role, content, data } = message;

  if (role === "status") {
    if (data?.type === "contacts") return <ContactsResult contacts={data.contacts} emailMap={emailMap} userProfile={userProfile} />;
    if (data?.type === "email")    return <EmailResult {...data} />;
    if (data?.type === "draft")    return <DraftResult draft={data.draft} />;
    if (content) return (
      <div className="flex items-center gap-2 text-xs text-slate-500 py-1">
        <span className="w-3 h-3 border border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
        {content}
      </div>
    );
    return null;
  }

  if (role === "user") return (
    <div className="flex justify-end">
      <div className="max-w-xs lg:max-w-md bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm px-4 py-2.5 rounded-2xl rounded-tr-sm">
        {content}
      </div>
    </div>
  );

  return (
    <div className="flex justify-start">
      <div className="max-w-xs lg:max-w-md bg-slate-800 border border-slate-700/50 text-slate-200 text-sm px-4 py-2.5 rounded-2xl rounded-tl-sm leading-relaxed">
        {content}
      </div>
    </div>
  );
}

// ── Contacts Result ───────────────────────────────────────────────────────────

function ContactsResult({ contacts, emailMap, userProfile }: {
  contacts: RankedContact[];
  emailMap: Record<string, string>;
  userProfile: FullProfile;
}) {
  return (
    <div className="space-y-2 max-w-lg">
      <p className="text-xs text-slate-500 uppercase tracking-wider">{contacts.length} contacts ranked</p>
      {contacts.map((c) => (
        <ContactRow
          key={c.name}
          contact={c}
          email={emailMap[c.name] ?? null}
          userProfile={userProfile}
        />
      ))}
    </div>
  );
}

type RowDraftState =
  | { status: "idle" }
  | { status: "drafting" }
  | { status: "ready"; subject: string; body: string }
  | { status: "sending" }
  | { status: "sent"; from: string }
  | { status: "error"; message: string };

function ContactRow({ contact, email, userProfile }: {
  contact: RankedContact;
  email: string | null;
  userProfile: FullProfile;
}) {
  const score = contact.relevance_score;
  const scoreColor = score >= 8 ? "text-emerald-400" : score >= 6 ? "text-amber-400" : "text-slate-400";
  const [draftState, setDraftState] = useState<RowDraftState>({ status: "idle" });

  async function handleDraftAndSend() {
    if (!email) return;
    setDraftState({ status: "drafting" });
    try {
      const res = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact, goal: contact.why_relevant, userProfile }),
      });
      if (!res.ok) throw new Error(await res.text());
      const draft = await res.json() as { email_subject: string; email_body: string };
      setDraftState({ status: "ready", subject: draft.email_subject, body: draft.email_body });
    } catch (e) {
      setDraftState({ status: "error", message: String(e) });
    }
  }

  async function handleSend(subject: string, body: string) {
    if (!email) return;
    setDraftState({ status: "sending" });
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: email, name: contact.name, subject, body }),
      });
      const data = await res.json() as { success?: boolean; from?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to send");
      setDraftState({ status: "sent", from: data.from ?? "" });
    } catch (e) {
      setDraftState({ status: "error", message: String(e) });
    }
  }

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-slate-600 text-xs font-mono shrink-0">#{contact.rank}</span>
            <p className="font-medium text-slate-200 text-sm truncate">{contact.name}</p>
          </div>
          <p className="text-xs text-slate-400 truncate">{contact.title} · {contact.company}</p>
          {contact.location && <p className="text-xs text-slate-600">{contact.location}</p>}
        </div>
        <span className={`text-base font-bold shrink-0 ${scoreColor}`}>
          {score}<span className="text-slate-600 text-xs">/10</span>
        </span>
      </div>
      <p className="text-xs text-slate-500 mt-2 leading-relaxed">{contact.why_relevant}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {contact.talking_points.map((pt, i) => (
          <span key={i} className="text-xs text-slate-600">→ {pt}</span>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <a
          href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${contact.name} ${contact.company}`)}`}
          target="_blank" rel="noopener noreferrer"
          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          Search LinkedIn ↗
        </a>
        {email && draftState.status === "idle" && (
          <button
            onClick={handleDraftAndSend}
            className="text-xs text-indigo-300 hover:text-indigo-200 border border-indigo-700/50 hover:border-indigo-500/60 rounded-lg px-3 py-1 transition-all"
          >
            Draft & send via Gmail →
          </button>
        )}
        {draftState.status === "drafting" && (
          <span className="text-xs text-slate-500 flex items-center gap-1.5">
            <span className="w-3 h-3 border border-indigo-400 border-t-transparent rounded-full animate-spin" />
            Drafting…
          </span>
        )}
        {draftState.status === "sending" && (
          <span className="text-xs text-slate-500 flex items-center gap-1.5">
            <span className="w-3 h-3 border border-indigo-400 border-t-transparent rounded-full animate-spin" />
            Sending…
          </span>
        )}
        {draftState.status === "sent" && (
          <span className="text-xs text-emerald-400">✓ Sent from {draftState.from}</span>
        )}
        {draftState.status === "error" && (
          <span className="text-xs text-red-400">{draftState.message}</span>
        )}
      </div>

      {/* Draft preview before sending */}
      {draftState.status === "ready" && (
        <div className="mt-3 space-y-2 border-t border-slate-700/40 pt-3">
          <div className="bg-slate-900/50 rounded-lg px-3 py-2">
            <p className="text-xs text-slate-500 mb-0.5">Subject</p>
            <p className="text-xs text-slate-300">{draftState.subject}</p>
          </div>
          <div className="bg-slate-900/50 rounded-lg px-3 py-2">
            <p className="text-xs text-slate-500 mb-0.5">Body</p>
            <p className="text-xs text-slate-300 whitespace-pre-wrap">{draftState.body}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleSend(draftState.subject, draftState.body)}
              className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium py-2 transition-colors"
            >
              Send to {email} →
            </button>
            <button
              onClick={() => setDraftState({ status: "idle" })}
              className="rounded-lg border border-slate-700 text-slate-500 hover:text-slate-300 text-xs px-3 py-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Email Result ──────────────────────────────────────────────────────────────

function EmailResult({ name, company, email, score, source }: { name: string; company: string; email: string | null; score: number; source: "hunter" | "unavailable" }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 py-3 max-w-sm">
      <p className="text-xs text-slate-500 mb-1.5">{name} · {company}</p>
      {email ? (
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm text-slate-200 font-mono">{email}</p>
          <span className="text-xs text-slate-500">{score}% confidence</span>
          <button
            onClick={() => { navigator.clipboard.writeText(email); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Email not found</p>
      )}
      <div className="mt-2">
        {source === "hunter" ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-900/30 border border-emerald-700/40 rounded-full px-2 py-0.5">
            ✓ Verified via Hunter.io
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-amber-400 bg-amber-900/30 border border-amber-700/40 rounded-full px-2 py-0.5">
            ⚠ Hunter.io not configured
          </span>
        )}
      </div>
    </div>
  );
}

// ── Draft Result ──────────────────────────────────────────────────────────────

function DraftResult({ draft }: { draft: OutreachDraft }) {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 max-w-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
      >
        <span className="text-sm font-medium text-slate-200">Outreach for {draft.contact_name}</span>
        <span className="text-slate-500 text-xs">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="border-t border-slate-700/50 px-4 py-3 space-y-3">
          {([
            { label: "Subject", content: draft.email_subject, key: "subj" },
            { label: "Email",   content: draft.email_body,    key: "body" },
          ] as const).map(({ label, content, key }) => (
            <div key={key}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
                <button
                  onClick={() => copy(content, key)}
                  className="text-xs text-slate-600 hover:text-slate-300 transition-colors"
                >
                  {copied === key ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-xs text-slate-300 bg-slate-900/40 rounded-lg px-3 py-2 whitespace-pre-wrap leading-relaxed">
                {content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Contacts View ─────────────────────────────────────────────────────────────

function ContactsView() {
  const [contacts, setContacts] = useState<SavedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    createClient()
      .from("contacts")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => { setContacts(data ?? []); setLoading(false); });
  }, []);

  const filtered = filter === "all" ? contacts : contacts.filter((c) => c.status === filter);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Contacts</h1>
          <p className="text-slate-400 mt-1 text-sm">{contacts.length} saved</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 bg-slate-800/60 rounded-lg p-1 w-fit">
        {["all", "saved", "drafted", "sent", "replied", "archived"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${
              filter === s
                ? "bg-slate-700 text-slate-100 shadow-sm"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 text-slate-500 text-sm py-16">
          <span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📋</div>
          <p className="font-medium text-slate-400">No contacts yet</p>
          <p className="text-sm text-slate-500 mt-1">
            Approve contacts from the Search tab to save them here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((contact) => (
            <SavedContactRow
              key={contact.id}
              contact={contact}
              onStatusChange={async (id, status) => {
                await createClient().from("contacts").update({ status }).eq("id", id);
                setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SavedContactRow({ contact, onStatusChange }: {
  contact: SavedContact;
  onStatusChange: (id: string, status: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const statusColors: Record<string, string> = {
    saved:    "bg-slate-700/60 text-slate-300",
    drafted:  "bg-indigo-900/50 text-indigo-300 border border-indigo-700/40",
    sent:     "bg-amber-900/50 text-amber-300 border border-amber-700/40",
    replied:  "bg-emerald-900/50 text-emerald-300 border border-emerald-700/40",
    archived: "bg-slate-800 text-slate-500",
  };

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-4">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
          {contact.name.charAt(0)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-slate-200 text-sm">{contact.name}</p>
            <span className={`text-xs rounded-full px-2 py-0.5 ${statusColors[contact.status] ?? statusColors.saved}`}>
              {contact.status}
            </span>
          </div>
          <p className="text-xs text-slate-400 truncate">
            {contact.title} · {contact.company}
            {contact.location ? ` · ${contact.location}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {contact.relevance_score && (
            <span className="text-xs text-slate-500 tabular-nums">{contact.relevance_score}/10</span>
          )}
          <a
            href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${contact.name} ${contact.company}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Search LinkedIn ↗
          </a>
          <select
            value={contact.status}
            onChange={(e) => onStatusChange(contact.id, e.target.value)}
            className="text-xs bg-slate-700/80 border border-slate-600/50 rounded-lg px-2 py-1 text-slate-300 focus:outline-none cursor-pointer"
          >
            {["saved", "drafted", "sent", "replied", "archived"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-slate-500 hover:text-slate-300 text-xs px-2 py-1 rounded hover:bg-slate-700 transition-colors"
          >
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {expanded && (contact.email_subject || contact.email_body) && (
        <div className="border-t border-slate-700/50 px-5 py-4 space-y-3 bg-slate-900/30">
          {contact.email_subject && (
            <DraftField
              label="Email subject"
              content={contact.email_subject}
              copied={copied === "subj"}
              onCopy={() => copy(contact.email_subject!, "subj")}
            />
          )}
          {contact.email_body && (
            <DraftField
              label="Email body"
              content={contact.email_body}
              copied={copied === "body"}
              onCopy={() => copy(contact.email_body!, "body")}
            />
          )}
        </div>
      )}
    </div>
  );
}

function DraftField({ label, content, copied, onCopy }: {
  label: string; content: string; copied: boolean; onCopy: () => void;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
        <button onClick={onCopy} className="text-xs text-slate-600 hover:text-slate-300 transition-colors">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <p className="text-sm text-slate-300 bg-slate-800/60 rounded-lg px-3 py-2 whitespace-pre-wrap">{content}</p>
    </div>
  );
}

// ── Profile View ──────────────────────────────────────────────────────────────

function ProfileView({ profile, onSave }: {
  profile: FullProfile;
  onSave: (updated: FullProfile) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FullProfile>({ ...profile });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setForm({ ...profile }); }, [profile]);

  function set(key: keyof FullProfile, value: string | number) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [, { error: profileErr }] = await Promise.all([
      supabase.from("users").update({ name: form.name }).eq("id", user.id),
      supabase.from("user_profiles").upsert({
        user_id: user.id,
        school: form.school ?? null,
        major: form.major ?? null,
        graduation_year: form.graduation_year ?? null,
        bio: form.bio ?? null,
        fraternity: form.fraternity ?? null,
        linkedin_url: form.linkedin_url ?? null,
      }, { onConflict: "user_id" }),
    ]);

    if (profileErr) { setError(profileErr.message); setSaving(false); return; }
    onSave(form);
    setEditing(false);
    setSaving(false);
  }

  const textFields: { label: string; key: keyof FullProfile; type: string; placeholder: string }[] = [
    { label: "Full name",            key: "name",            type: "text",   placeholder: "Alex Johnson" },
    { label: "School",               key: "school",          type: "text",   placeholder: "University of Michigan" },
    { label: "Major",                key: "major",           type: "text",   placeholder: "Computer Science" },
    { label: "Graduation year",      key: "graduation_year", type: "number", placeholder: "2026" },
    { label: "Fraternity / Sorority",key: "fraternity",      type: "text",   placeholder: "Alpha Beta Gamma" },
    { label: "LinkedIn URL",         key: "linkedin_url",    type: "url",    placeholder: "https://linkedin.com/in/yourname" },
  ];

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Profile</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Used to personalize outreach and surface shared connections.
          </p>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:text-slate-100 hover:border-slate-500 text-sm transition-all"
          >
            Edit
          </button>
        )}
      </div>

      {/* Avatar card */}
      <div className="flex items-center gap-4 mb-8 p-5 rounded-2xl border border-slate-700/50 bg-slate-800/40">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-2xl font-bold text-white shrink-0">
          {profile.name?.charAt(0)?.toUpperCase() ?? "?"}
        </div>
        <div>
          <p className="text-lg font-semibold text-slate-100">{profile.name ?? "—"}</p>
          <p className="text-sm text-slate-400">
            {[profile.major, profile.school].filter(Boolean).join(" · ") || "No details yet"}
          </p>
          {profile.graduation_year && (
            <p className="text-xs text-slate-500 mt-0.5">Class of {profile.graduation_year}</p>
          )}
          {profile.fraternity && (
            <p className="text-xs text-slate-500">{profile.fraternity}</p>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-900/30 border border-red-700/50 px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {textFields.map(({ label, key, type, placeholder }) => (
          <div key={key} className="space-y-1.5">
            <label className="text-xs text-slate-400 font-medium">{label}</label>
            {editing ? (
              <input
                type={type}
                value={(form[key] as string) ?? ""}
                onChange={(e) => set(key, type === "number" ? parseInt(e.target.value) || 0 : e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5
                           text-sm text-slate-100 placeholder-slate-600
                           focus:border-indigo-500/60 focus:outline-none transition-colors"
              />
            ) : (
              <p className="px-4 py-2.5 rounded-xl border border-slate-700/40 bg-slate-800/30 text-sm text-slate-300">
                {profile[key] ? String(profile[key]) : <span className="text-slate-600">—</span>}
              </p>
            )}
          </div>
        ))}

        <div className="space-y-1.5">
          <label className="text-xs text-slate-400 font-medium">Bio</label>
          {editing ? (
            <textarea
              value={form.bio ?? ""}
              onChange={(e) => set("bio", e.target.value)}
              placeholder="Short bio used to personalize outreach…"
              rows={3}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5
                         text-sm text-slate-100 placeholder-slate-600 resize-none
                         focus:border-indigo-500/60 focus:outline-none transition-colors"
            />
          ) : (
            <p className="px-4 py-2.5 rounded-xl border border-slate-700/40 bg-slate-800/30 text-sm text-slate-300 min-h-[72px]">
              {profile.bio ?? <span className="text-slate-600">—</span>}
            </p>
          )}
        </div>
      </div>

      {editing && (
        <div className="flex gap-3 mt-6">
          <button
            onClick={() => { setEditing(false); setForm({ ...profile }); }}
            className="flex-1 rounded-xl border border-slate-700 text-slate-400 hover:text-slate-200 py-2.5 text-sm transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600
                       hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40
                       text-white font-semibold py-2.5 text-sm transition-all
                       shadow-lg shadow-indigo-900/40"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}

      {/* Gmail integration */}
      <div className="mt-10 border-t border-slate-700/50 pt-8">
        <h2 className="text-base font-semibold text-slate-200 mb-1">Email integration</h2>
        <p className="text-sm text-slate-500 mb-5">
          Connect Gmail to send outreach emails directly from your account.
        </p>
        <GmailSection />
      </div>
    </div>
  );
}

// ── Gmail Section ─────────────────────────────────────────────────────────────

function GmailSection() {
  const [status, setStatus] = useState<"loading" | "connected" | "disconnected">("loading");
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setStatus("disconnected"); return; }
      const { data: tokenRow } = await supabase
        .from("user_google_tokens")
        .select("gmail_email")
        .eq("user_id", data.user.id)
        .single();
      if (tokenRow?.gmail_email) {
        setGmailEmail(tokenRow.gmail_email);
        setStatus("connected");
      } else {
        setStatus("disconnected");
      }
    });
  }, []);

  async function handleDisconnect() {
    setDisconnecting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("user_google_tokens").delete().eq("user_id", user.id);
    }
    setStatus("disconnected");
    setGmailEmail(null);
    setDisconnecting(false);
  }

  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 text-slate-500 text-sm">
        <span className="w-3.5 h-3.5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
        Checking connection…
      </div>
    );
  }

  if (status === "connected" && gmailEmail) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-emerald-700/40 bg-emerald-900/20 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-emerald-400 text-base">✓</span>
          <div>
            <p className="text-sm font-medium text-emerald-300">Gmail connected</p>
            <p className="text-xs text-slate-400">{gmailEmail}</p>
          </div>
        </div>
        <button
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="text-xs text-slate-500 hover:text-red-400 transition-colors"
        >
          {disconnecting ? "Removing…" : "Disconnect"}
        </button>
      </div>
    );
  }

  return (
    <a
      href="/api/auth/google"
      className="inline-flex items-center gap-2.5 rounded-xl border border-slate-600 bg-slate-800/60
                 hover:border-indigo-500/60 hover:bg-indigo-950/40 px-5 py-3 text-sm text-slate-300
                 hover:text-indigo-300 transition-all"
    >
      {/* Google G icon */}
      <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      Connect Gmail
    </a>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function ContactsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
