import { type ReactNode } from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";

import { useTheme } from "@/core/theme";
import { fonts, typography, type TypeStyle } from "@/core/theme/typography";

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
	children: ReactNode;
}

export function AppText({
	variant = "bodyMedium",
	weight,
	color,
	style,
	numberOfLines,
	children,
}: AppTextProps) {
	const { colors } = useTheme();
	const base: TypeStyle = typography[variant];
	return (
		<Text
			numberOfLines={numberOfLines}
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
