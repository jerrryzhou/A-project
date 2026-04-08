import Anthropic from "@anthropic-ai/sdk";

// Singleton — shared across all API routes in the same process
// max_retries: SDK will auto-retry 429s with exponential backoff (up to ~2 min total)
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 4,
});

export const MODEL = "claude-opus-4-6";        // outreach only — where quality matters
export const MODEL_FAST = "claude-sonnet-4-6"; // ranking
export const MODEL_CHEAP = "claude-haiku-4-5"; // search + parse — high token volume, quality not critical
