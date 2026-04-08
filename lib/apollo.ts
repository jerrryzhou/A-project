import type { RawContact } from "./schemas";
import type { SearchCriteria } from "./schemas";

const APOLLO_BASE = "https://api.apollo.io/api/v1";

interface ApolloPersonResult {
  name: string;
  title: string;
  organization?: { name?: string; industry?: string };
  city?: string;
  state?: string;
  country?: string;
  linkedin_url?: string;
  email?: string;
  headline?: string;
}

interface ApolloSearchResponse {
  people: ApolloPersonResult[];
  pagination: { total_entries: number };
}

export async function searchContacts(
  criteria: SearchCriteria,
  limit = 50
): Promise<RawContact[]> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error("APOLLO_API_KEY is not set");

  const body = {
    page: 1,
    per_page: limit,
    person_titles: criteria.roles,
    person_locations: criteria.locations,
    person_seniorities: criteria.seniority,
    // Apollo uses keyword search for industry filtering
    q_keywords: [...criteria.industries, ...criteria.keywords].join(" "),
  };

  const res = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "X-Api-Key": apiKey },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apollo API error ${res.status}: ${text}`);
  }

  const data: ApolloSearchResponse = await res.json();

  return (data.people ?? []).map((p) => ({
    name: p.name ?? "Unknown",
    title: p.title ?? "",
    company: p.organization?.name ?? "",
    company_industry: p.organization?.industry,
    location: [p.city, p.state, p.country].filter(Boolean).join(", ") || undefined,
    linkedin_url: p.linkedin_url,
    email: p.email,
    headline: p.headline,
  }));
}
