export const BUSINESS_TYPES = [
  'restaurant',
  'bakery',
  'cafe',
  'grocery',
  'other',
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const BusinessType = {
  RESTAURANT: 'restaurant',
  BAKERY: 'bakery',
  CAFE: 'cafe',
  GROCERY: 'grocery',
  OTHER: 'other',
} as const satisfies Record<string, BusinessType>;
