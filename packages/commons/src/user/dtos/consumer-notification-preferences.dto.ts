import type { z } from 'zod';
import type {
  ConsumerNotificationPreferencesSchema,
  CreateConsumerNotificationPreferencesSchema,
  UpdateConsumerNotificationPreferencesSchema,
} from '../schemas/consumer-notification-preferences.schema';

export type ConsumerNotificationPreferencesDto = z.infer<
  typeof ConsumerNotificationPreferencesSchema
>;
export type CreateConsumerNotificationPreferencesDto = z.infer<
  typeof CreateConsumerNotificationPreferencesSchema
>;
export type UpdateConsumerNotificationPreferencesDto = z.infer<
  typeof UpdateConsumerNotificationPreferencesSchema
>;
