import type { z } from 'zod';
import type {
  BusinessNotificationPreferencesSchema,
  CreateBusinessNotificationPreferencesSchema,
  UpdateBusinessNotificationPreferencesSchema,
} from '../schemas/business-notification-preferences.schema';

export type BusinessNotificationPreferencesDto = z.infer<
  typeof BusinessNotificationPreferencesSchema
>;
export type CreateBusinessNotificationPreferencesDto = z.infer<
  typeof CreateBusinessNotificationPreferencesSchema
>;
export type UpdateBusinessNotificationPreferencesDto = z.infer<
  typeof UpdateBusinessNotificationPreferencesSchema
>;
