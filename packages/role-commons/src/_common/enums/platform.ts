export const PLATFORMS = ['ios', 'android', 'web'] as const;
export type Platform = (typeof PLATFORMS)[number];
export const Platform = {
  IOS: 'ios',
  ANDROID: 'android',
  WEB: 'web',
} as const satisfies Record<string, Platform>;
