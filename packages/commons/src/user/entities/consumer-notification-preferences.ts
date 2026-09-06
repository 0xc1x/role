import type { z } from 'zod';
import type { ConsumerNotificationPreferencesSchema } from '../schemas/consumer-notification-preferences.schema';

/** Row shape for `public.consumer_notification_preferences` — derivado del schema Zod (SSOT). */
export type ConsumerNotificationPreferences = z.infer<
  typeof ConsumerNotificationPreferencesSchema
>;
