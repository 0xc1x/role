import type { z } from 'zod';
import type { DeviceTokenSchema } from '../schemas/device-token.schema';

/** Row shape for `public.device_tokens` — derivado del schema Zod (SSOT). */
export type DeviceToken = z.infer<typeof DeviceTokenSchema>;
