export const ADDRESS_TYPES = ['home', 'work', 'other'] as const;
export type AddressType = (typeof ADDRESS_TYPES)[number];
export const AddressType = {
  HOME: 'home',
  WORK: 'work',
  OTHER: 'other',
} as const satisfies Record<string, AddressType>;
