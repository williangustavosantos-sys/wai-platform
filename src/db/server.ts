import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Creates an authenticated Supabase server client bound to the current user's session cookies.
 * Operates under strict Row Level Security (RLS) policies.
 */
export async function createServerClient() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'example-anon-key';

  return createSupabaseServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if middleware is refreshing user sessions.
          }
        },
      },
    }
  );
}

/**
 * Creates an administrative server-only Supabase client bypassing RLS.
 * CRITICAL SECURITY GUARANTEES:
 * 1. Must NEVER be invoked in browser or client environments.
 * 2. Uses SUPABASE_SERVICE_ROLE_KEY without NEXT_PUBLIC prefix.
 * 3. Restricted to administrative global routes or system audit logs.
 */
export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('SECURITY VIOLATION: Admin client cannot be executed in browser environments.');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'example-service-role-key';

  if (!serviceRoleKey || serviceRoleKey === 'example-service-role-key') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CRITICAL: SUPABASE_SERVICE_ROLE_KEY is required in production.');
    }
  }

  return createSupabaseJsClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
