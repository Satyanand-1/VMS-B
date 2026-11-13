import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Session-aware client (sign-in, sign-out, current user). Data access goes through db() after scope checks.
export async function authClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are refreshed by the middleware instead.
        }
      }
    }
  });
}
