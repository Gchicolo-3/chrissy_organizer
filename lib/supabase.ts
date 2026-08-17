import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

// Server-side only. Created lazily so a missing env var fails the request
// with a clear message instead of crashing the whole module at import time.
export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false },
    global: {
      // Next.js patches global fetch and can serve route-handler fetches from
      // its persistent Data Cache even on force-dynamic routes — which made
      // /api/calendar return deleted rows. Every Supabase request must skip it.
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  return client;
}
