import { Platform } from 'react-native';

/**
 * Rolé typography scale, ported from the Flutter design system
 * (Outfit headings + DM Sans body).
 */
export const fonts = {
  heading: Platform.select({
    ios: 'Outfit_600SemiBold',
    android: 'Outfit_600SemiBold',
    default: 'Outfit_600SemiBold',
  }),
  headingBold: Platform.select({
    ios: 'Outfit_700Bold',
    android: 'Outfit_700Bold',
    default: 'Outfit_700Bold',
  }),
  headingExtraBold: Platform.select({
    ios: 'Outfit_800ExtraBold',
    android: 'Outfit_800ExtraBold',
    default: 'Outfit_800ExtraBold',
  }),
  body: Platform.select({
    ios: 'DMSans_400Regular',
    android: 'DMSans_400Regular',
    default: 'DMSans_400Regular',
  }),
  bodyMedium: Platform.select({
    ios: 'DMSans_500Medium',
    android: 'DMSans_500Medium',
    default: 'DMSans_500Medium',
  }),
  bodySemiBold: Platform.select({
    ios: 'DMSans_600SemiBold',
    android: 'DMSans_600SemiBold',
    default: 'DMSans_600SemiBold',
  }),
  bodyBold: Platform.select({
    ios: 'DMSans_700Bold',
    android: 'DMSans_700Bold',
    default: 'DMSans_700Bold',
  }),
} as const;

export interface TypeStyle {
  fontSize: number;
  fontWeight?: '400' | '500' | '600' | '700' | '800';
  lineHeight?: number;
  fontFamily?: string;
}

export const typography = {
  h1: { fontFamily: fonts.headingExtraBold, fontSize: 24, lineHeight: 31 },
  h2: { fontFamily: fonts.headingBold, fontSize: 20, lineHeight: 26 },
  h3: { fontFamily: fonts.headingBold, fontSize: 18, lineHeight: 23 },
  h4: { fontFamily: fonts.headingBold, fontSize: 16, lineHeight: 21 },
  bodyLarge: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24 },
  bodyMedium: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  bodySmall: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  labelMedium: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 24 },
  labelSmall: { fontFamily: fonts.bodyMedium, fontSize: 14 },
  price: { fontFamily: fonts.headingBold, fontSize: 18, fontWeight: '700' },
  priceOriginal: { fontFamily: fonts.body, fontSize: 14 },
  priceLarge: {
    fontFamily: fonts.headingExtraBold,
    fontSize: 24,
    fontWeight: '800',
  },
} as const satisfies Record<string, TypeStyle>;
