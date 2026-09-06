import type { z } from 'zod';
import type { UserConsentSchema } from '../schemas/user-consent.schema';

/** Row shape for `public.user_consents` — derivado del schema Zod (SSOT). */
export type UserConsent = z.infer<typeof UserConsentSchema>;
