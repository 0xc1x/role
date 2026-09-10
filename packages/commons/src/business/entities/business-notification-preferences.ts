import type { z } from 'zod';
import type { BusinessNotificationPreferencesSchema } from '../schemas/business-notification-preferences.schema';

/** Row shape for `public.business_notification_preferences` — derivado del schema Zod (SSOT). */
export type BusinessNotificationPreferences = z.infer<
  typeof BusinessNotificationPreferencesSchema
>;
