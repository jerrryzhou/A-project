const EXA_BASE = "https://api.exa.ai";

export interface ExaResult {
  id:            string;
  url:           string;
  title:         string;
  text?:         string;
  author?:       string;
  publishedDate?: string;
}

export interface ExaSearchResponse {
  results: ExaResult[];
}

export async function exaSearch(
  query: string,
  numResults = 20
): Promise<ExaResult[]> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) throw new Error("EXA_API_KEY not set");

  const res = await fetch(`${EXA_BASE}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      query,
      numResults,
      type: "neural",          // semantic search
      useAutoprompt: true,     // Exa rewrites query for better results
      includeDomains: ["linkedin.com"],
      contents: {
        text: { maxCharacters: 400 }, // snippet per result
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Exa search failed: ${err}`);
  }

  const data = await res.json() as ExaSearchResponse;
  return data.results;
}

export function buildExaQuery(params: {
  roles:      string[];
  industries: string[];
  locations:  string[];
  keywords?:  string[];
  goal:       string;
}): string {
  // Build a natural language query Exa can search semantically
  const parts = [
    params.roles.slice(0, 3).join(" or "),
    params.industries.slice(0, 2).join(" "),
    params.locations.slice(0, 2).join(" or "),
    ...(params.keywords ?? []).slice(0, 3),
  ].filter(Boolean);

  return parts.join(" ") || params.goal;
}
