export const EMAIL_COMPONENT_TYPES = ['header', 'footer'] as const;
export type EmailComponentType = (typeof EMAIL_COMPONENT_TYPES)[number];

export const SEGMENT_TYPES = ['static', 'dynamic'] as const;
export type SegmentType = (typeof SEGMENT_TYPES)[number];

export const CAMPAIGN_STATUSES = [
  'draft',
  'scheduled',
  'sending',
  'sent',
  'cancelled',
  'failed',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const EMAIL_SEND_STATUSES = [
  'queued',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'complained',
  'failed',
] as const;
export type EmailSendStatus = (typeof EMAIL_SEND_STATUSES)[number];

/** Categorías de marketing aceptables por destinatario. */
export const MARKETING_CATEGORIES = ['announcements', 'promotions', 'news'] as const;
export type MarketingCategory = (typeof MARKETING_CATEGORIES)[number];
