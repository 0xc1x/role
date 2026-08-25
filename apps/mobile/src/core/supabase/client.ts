import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/core/config/env';

/**
 * Single Supabase client for the whole app.
 *
 * Per ADR-0002 the mobile app talks to Supabase directly (RLS is the
 * data boundary) — there is no API intermediary for consumer flows.
 */
export const supabase: SupabaseClient = createClient(
  env.EXPO_PUBLIC_SUPABASE_URL,
  env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
