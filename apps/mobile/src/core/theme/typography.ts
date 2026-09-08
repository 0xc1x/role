/**
 * Rolé typography scale, ported from the Flutter design system
 * (Outfit headings + DM Sans body).
 *
 * Familias registradas por expo-font con el mismo nombre en todas las
 * plataformas: no hace falta Platform.select.
 */
export const fonts = {
  heading: 'Outfit_600SemiBold',
  headingBold: 'Outfit_700Bold',
  headingExtraBold: 'Outfit_800ExtraBold',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodySemiBold: 'DMSans_600SemiBold',
  bodyBold: 'DMSans_700Bold',
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
  caption: { fontFamily: fonts.body, fontSize: 11, lineHeight: 15 },
  tiny: { fontFamily: fonts.body, fontSize: 10, lineHeight: 13 },
  labelMedium: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 24 },
  labelSmall: { fontFamily: fonts.bodyMedium, fontSize: 14 },
  button: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 24 },
  price: { fontFamily: fonts.headingBold, fontSize: 18, fontWeight: '700' },
  priceOriginal: { fontFamily: fonts.body, fontSize: 14 },
  priceLarge: {
    fontFamily: fonts.headingExtraBold,
    fontSize: 24,
    fontWeight: '800',
  },
} as const satisfies Record<string, TypeStyle>;
