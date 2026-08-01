import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr';

/**
 * Creates a browser-side Supabase client using public anonymous credentials.
 * GUARANTEE: Never exposes or accepts administrative service_role keys.
 */
export function createBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'example-anon-key';

  return createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey);
}
