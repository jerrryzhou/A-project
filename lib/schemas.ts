import { z } from "zod";

// ── Step 1: goal → structured criteria ───────────────────────────────────────

export const SearchCriteriaSchema = z.object({
  roles: z.array(z.string()).describe(
    'Job title variations, e.g. ["Founder", "Co-Founder", "CEO", "CTO"]'
  ),
  industries: z.array(z.string()).describe(
    'Industry keywords, e.g. ["fintech", "financial technology", "payments"]'
  ),
  locations: z.array(z.string()).describe(
    'City/region name variations, e.g. ["New York City", "New York", "NYC"]'
  ),
  seniority: z.array(z.string()).describe(
    'Apollo seniority levels: founder, c_suite, vp, director, manager, senior, entry'
  ),
  keywords: z.array(z.string()).describe(
    'Extra search keywords, e.g. ["Series A", "YC", "seed stage"]'
  ),
  timeframe_days: z.number().describe("Days ahead the user wants to meet (default 30)"),
  meeting_goal: z.string().describe("One-sentence plain-English summary of what the user wants"),
});

export type SearchCriteria = z.infer<typeof SearchCriteriaSchema>;

// ── Step 2: raw Apollo contacts ───────────────────────────────────────────────

export const RawContactSchema = z.object({
  name: z.string(),
  title: z.string(),
  company: z.string(),
  company_industry: z.string().optional(),
  location: z.string().optional(),
  linkedin_url: z.string().optional(),
  email: z.string().optional(),
  headline: z.string().optional(),
});

export type RawContact = z.infer<typeof RawContactSchema>;

// ── Step 3: Claude-ranked results ────────────────────────────────────────────

export const RankedContactSchema = z.object({
  rank: z.number().describe("1 = best match"),
  name: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string().optional(),
  linkedin_url: z.string().optional(),
  email: z.string().optional(),
  relevance_score: z.number().min(1).max(10),
  why_relevant: z.string().describe("1–2 sentences on why this person is worth meeting"),
  talking_points: z.array(z.string()).describe("2–3 concrete conversation starters"),
});

export const RankedResultsSchema = z.object({
  contacts: z.array(RankedContactSchema).max(10),
  total_searched: z.number(),
  criteria_summary: z.string().describe("One sentence describing what was searched for"),
});

export type RankedContact = z.infer<typeof RankedContactSchema>;
export type RankedResults = z.infer<typeof RankedResultsSchema>;

// ── Step 4: outreach drafts ───────────────────────────────────────────────────

export const OutreachDraftSchema = z.object({
  contact_name: z.string(),
  linkedin_note: z.string().max(300).describe(
    "LinkedIn connection request note — ≤300 chars, warm and specific to this person"
  ),
  email_subject: z.string(),
  email_body: z.string().describe(
    "~100-word email, plain and direct, no fluff, clear ask"
  ),
});

export type OutreachDraft = z.infer<typeof OutreachDraftSchema>;
