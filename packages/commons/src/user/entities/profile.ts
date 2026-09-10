import type { z } from 'zod';
import type { ProfileSchema } from '../schemas/profile.schema';

/** Row shape for `public.profiles` — derivado del schema Zod (SSOT). */
export type Profile = z.infer<typeof ProfileSchema>;
