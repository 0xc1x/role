import type { z } from 'zod';
import type { PaginatedData } from '../../_common/dtos/api.dto';
import {
  CreatePushSendSchema,
  CreatePushTemplateSchema,
  ListPushNotificationsQuerySchema,
  ListPushTemplatesQuerySchema,
  ListPushTokensQuerySchema,
  PushAudienceSchema,
  PushNotificationDtoSchema,
  PushPayloadSchema,
  PushTemplateDtoSchema,
  PushTestSchema,
  PushTokenDtoSchema,
  UpdatePushTemplateSchema,
  UpdatePushTokenSchema,
} from '../schemas/push.schema';

export type PushTemplateDto = z.infer<typeof PushTemplateDtoSchema>;
export type PushNotificationDto = z.infer<typeof PushNotificationDtoSchema>;
export type PushTokenDto = z.infer<typeof PushTokenDtoSchema>;
export type PushPayloadDto = z.infer<typeof PushPayloadSchema>;
export type PushAudienceDto = z.infer<typeof PushAudienceSchema>;

export type CreatePushTemplateDto = z.infer<typeof CreatePushTemplateSchema>;
export type UpdatePushTemplateDto = z.infer<typeof UpdatePushTemplateSchema>;
export type CreatePushSendDto = z.infer<typeof CreatePushSendSchema>;
export type PushTestDto = z.infer<typeof PushTestSchema>;
export type UpdatePushTokenDto = z.infer<typeof UpdatePushTokenSchema>;

export type ListPushNotificationsQuery = z.infer<typeof ListPushNotificationsQuerySchema>;
export type ListPushTemplatesQuery = z.infer<typeof ListPushTemplatesQuerySchema>;
export type ListPushTokensQuery = z.infer<typeof ListPushTokensQuerySchema>;

export type PushTemplatePaginatedData = PaginatedData<PushTemplateDto>;
export type PushNotificationPaginatedData = PaginatedData<PushNotificationDto>;
export type PushTokenPaginatedData = PaginatedData<PushTokenDto>;

export type {
  PushNotificationListResponseSchema,
  PushTemplateListResponseSchema,
  PushTokenListResponseSchema,
} from '../schemas/push.schema';
