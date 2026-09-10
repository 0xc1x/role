import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import { AppText, Card } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { withAlpha } from "@/core/theme/alpha";
import { useRandomTip } from "@/features/tips/hooks";
import { useState } from "react";

/**
 * Banner de "Consejo del día" entre el grid de categorías y la lista de
 * ofertas. Muestra un consejo aleatorio de Supabase; se oculta si no hay.
 */
export function ExploreTipSection() {
	const { colors, scheme } = useTheme();
	const isDark = scheme === "dark";
	const { data: tip, isLoading } = useRandomTip();
	const [isExpanded, setIsExpanded] = useState(false);

	if (isLoading || !tip) return null;

	const cardBackground = isDark ? colors.surfaceWarning : colors.yellowLight;
	const cardBorder = withAlpha(colors.yellowDark, isDark ? 0.3 : 0.2);

	return (
		<View style={styles.wrap}>
			<Card
				style={[
					styles.card,
					{
						backgroundColor: cardBackground,
						borderColor: cardBorder,
						borderWidth: 1,
					},
				]}
			>
				<Pressable
					style={styles.titleRow}
					onPress={() => setIsExpanded((prev) => !prev)}
					accessibilityRole="button"
				>
					<View style={styles.titleLeft}>
						<View
						style={[
							styles.bulbCircle,
							{
							backgroundColor: isExpanded
								? withAlpha(colors.yellow, isDark ? 0.25 : 0.35)
								: withAlpha(colors.card, isDark ? 0 : 0.5),
							boxShadow: isExpanded
								? `0px 0px 16px ${withAlpha(colors.yellowDark, isDark ? 0.55 : 0.45)}`
								: `0px 0px 8px ${withAlpha(colors.yellowDark, isDark ? 0.15 : 0.2)}`,
							},
						]}
						>
							<Ionicons
								name="bulb"
								size={20}
								color={
								isExpanded
									? (isDark ? colors.yellow : colors.yellowDark)
									: withAlpha(isDark ? colors.yellow : colors.yellowDark, 0.55)
								}
						/>
						</View>
						<AppText variant="h4" weight="bold">
							{strings.explore.tipTitle}
						</AppText>
					</View>
					<Ionicons
						name={isExpanded ? "chevron-up" : "chevron-down"}
						size={20}
						color={isDark ? colors.yellow : colors.yellowDark}
					/>
				</Pressable>
				{isExpanded && (
					<AppText
						variant="bodyMedium"
						style={[styles.tipBody, { color: colors.foreground }]}
					>
						{tip.content}
					</AppText>
				)}
			</Card>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.md,
	},
	card: {
		padding: spacing.lg,
		borderRadius: radii.xl,
		borderWidth: 1,
	},
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		width: "100%",
	},
	titleLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	bulbCircle: {
		width: 32,
		height: 32,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
	},
	tipBody: {
		marginTop: spacing.md,
		lineHeight: 20,
	},
});