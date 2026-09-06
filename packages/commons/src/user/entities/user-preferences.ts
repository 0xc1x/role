import type { z } from 'zod';
import type { UserPreferencesSchema } from '../schemas/user-preferences.schema';

/** Row shape for `public.user_preferences` — derivado del schema Zod (SSOT). */
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
