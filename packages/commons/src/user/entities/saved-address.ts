import type { z } from 'zod';
import type { SavedAddressSchema } from '../schemas/saved-address.schema';

/** Row shape for `public.saved_addresses` — derivado del schema Zod (SSOT). */
export type SavedAddress = z.infer<typeof SavedAddressSchema>;
