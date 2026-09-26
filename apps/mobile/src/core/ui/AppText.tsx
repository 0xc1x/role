import { type ReactNode } from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";

import { useTheme } from "@/src/core/theme";
import { fonts, typography, type TypeStyle } from "@/src/core/theme/typography";

export type FontVariant = keyof typeof typography;
export type FontWeight =
	| "regular"
	| "medium"
	| "semiBold"
	| "bold"
	| "extraBold";

const WEIGHT_FONTS: Record<FontWeight, string> = {
	regular: fonts.body,
	medium: fonts.bodyMedium,
	semiBold: fonts.bodySemiBold,
	bold: fonts.bodyBold,
	extraBold: fonts.headingExtraBold,
};

interface AppTextProps {
	variant?: FontVariant;
	weight?: FontWeight;
	color?: string;
	style?: StyleProp<TextStyle>;
	numberOfLines?: number;
	/**
	 * Caps OS font scaling for this run of text. Use it where the design pins a
	 * box around the text (a clamped card, a two-line grid cell) that a large
	 * system font would otherwise break out of. Defaults to RN's own behaviour
	 * (scale up to the system limit).
	 */
	maxFontSizeMultiplier?: number;
	children: ReactNode;
}

export function AppText({
	variant = "bodyMedium",
	weight,
	color,
	style,
	numberOfLines,
	maxFontSizeMultiplier,
	children,
}: AppTextProps) {
	const { colors } = useTheme();
	const base: TypeStyle = typography[variant];
	return (
		<Text
			numberOfLines={numberOfLines}
			maxFontSizeMultiplier={maxFontSizeMultiplier}
			style={[
				{
					fontFamily: weight ? WEIGHT_FONTS[weight] : base.fontFamily,
					fontSize: base.fontSize,
					lineHeight: base.lineHeight ?? base.fontSize * 1.4,
					color: color ?? colors.foreground,
				},
				style,
			]}
		>
			{children}
		</Text>
	);
}
