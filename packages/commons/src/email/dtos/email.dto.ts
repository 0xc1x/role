import type { z } from 'zod';
import type { PaginatedData } from '../../_common/dtos/api.dto';
import type { SegmentFiltersSchema } from '../schemas/email.schema';

export type SegmentFilters = z.infer<typeof SegmentFiltersSchema>;
import {
  CampaignDtoSchema,
  CampaignListResponseSchema,
  EmailComponentDtoSchema,
  EmailComponentListResponseSchema,
  EmailSendDtoSchema,
  EmailTemplateDtoSchema,
  EmailTemplateListResponseSchema,
  SegmentDtoSchema,
  SegmentListResponseSchema,
  RenderedEmailSchema,
  CreateCampaignSchema,
  CreateEmailComponentSchema,
  CreateEmailTemplateSchema,
  CreateSegmentSchema,
  ListCampaignsQuerySchema,
  ListComponentsQuerySchema,
  ListSendsQuerySchema,
  TestCampaignSchema,
  UpdateCampaignSchema,
  UpdateEmailComponentSchema,
  UpdateEmailTemplateSchema,
  UpdateSegmentSchema,
} from '../schemas/email.schema';

export type EmailComponentDto = z.infer<typeof EmailComponentDtoSchema>;
export type EmailTemplateDto = z.infer<typeof EmailTemplateDtoSchema>;
export type SegmentDto = z.infer<typeof SegmentDtoSchema>;
export type CampaignDto = z.infer<typeof CampaignDtoSchema>;
export type EmailSendDto = z.infer<typeof EmailSendDtoSchema>;
export type RenderedEmailDto = z.infer<typeof RenderedEmailSchema>;

export type CreateEmailComponentDto = z.infer<typeof CreateEmailComponentSchema>;
export type UpdateEmailComponentDto = z.infer<typeof UpdateEmailComponentSchema>;
export type CreateEmailTemplateDto = z.infer<typeof CreateEmailTemplateSchema>;
export type UpdateEmailTemplateDto = z.infer<typeof UpdateEmailTemplateSchema>;
export type CreateSegmentDto = z.infer<typeof CreateSegmentSchema>;
export type UpdateSegmentDto = z.infer<typeof UpdateSegmentSchema>;
export type CreateCampaignDto = z.infer<typeof CreateCampaignSchema>;
export type UpdateCampaignDto = z.infer<typeof UpdateCampaignSchema>;

export type ListComponentsQuery = z.infer<typeof ListComponentsQuerySchema>;
export type ListCampaignsQuery = z.infer<typeof ListCampaignsQuerySchema>;
export type ListSendsQuery = z.infer<typeof ListSendsQuerySchema>;
export type TestCampaignDto = z.infer<typeof TestCampaignSchema>;

export type EmailComponentPaginatedData = PaginatedData<EmailComponentDto>;
export type EmailTemplatePaginatedData = PaginatedData<EmailTemplateDto>;
export type SegmentPaginatedData = PaginatedData<SegmentDto>;
export type CampaignPaginatedData = PaginatedData<CampaignDto>;
export type EmailSendPaginatedData = PaginatedData<EmailSendDto>;
export type { EmailComponentListResponseSchema, EmailTemplateListResponseSchema, SegmentListResponseSchema, CampaignListResponseSchema };
