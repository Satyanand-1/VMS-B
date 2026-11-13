import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Service-role client: used only on the server, after the signed-in user's role and scope were checked.
let cached: SupabaseClient | null = null;
export function db(): SupabaseClient {
  if (!cached) {
    cached = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return cached;
}

// Throws on a Supabase error so callers don't silently continue with null data.
export function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}
