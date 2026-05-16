import type { SupabaseClient } from "@supabase/supabase-js";

const REQUESTS_PER_DAY = 20;

/**
 * Returns true if the user is within their daily limit and logs the request.
 * Returns false if they've hit the cap.
 *
 * Requires a table in Supabase:
 *   create table agent_requests (
 *     id         uuid        default gen_random_uuid() primary key,
 *     user_id    uuid        references auth.users not null,
 *     created_at timestamptz default now() not null
 *   );
 *   create index on agent_requests (user_id, created_at);
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("agent_requests")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);

  if (error) {
    // If the table doesn't exist yet, fail open so the app still works
    console.warn("[rateLimit] Could not check rate limit:", error.message);
    return { allowed: true, used: 0, limit: REQUESTS_PER_DAY };
  }

  const used = count ?? 0;

  if (used >= REQUESTS_PER_DAY) {
    return { allowed: false, used, limit: REQUESTS_PER_DAY };
  }

  await supabase.from("agent_requests").insert({ user_id: userId });

  return { allowed: true, used: used + 1, limit: REQUESTS_PER_DAY };
}
