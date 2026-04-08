const BRAVE_BASE = "https://api.search.brave.com/res/v1/web/search";

export interface BraveResult {
  title: string;
  url: string;
  description: string;
}

export async function braveSearch(query: string, count = 10): Promise<BraveResult[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) throw new Error("BRAVE_SEARCH_API_KEY is not set");

  const params = new URLSearchParams({ q: query, count: String(count) });
  const res = await fetch(`${BRAVE_BASE}?${params}`, {
    headers: { "X-Subscription-Token": apiKey, Accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brave Search error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return (data.web?.results ?? []) as BraveResult[];
}
