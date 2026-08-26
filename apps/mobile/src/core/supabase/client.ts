import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
      // Sin adaptador, supabase-js cae a memoria en nativo y la sesión
      // se pierde en cada reinicio de la app.
      storage: AsyncStorage,
    },
  },
);
