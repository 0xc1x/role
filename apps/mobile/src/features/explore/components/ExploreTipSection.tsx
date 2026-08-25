import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { useRandomTip } from "@/features/tips/hooks";

/**
 * Banner de "Consejo del día" entre el grid de categorías y la lista de
 * ofertas. Muestra un consejo aleatorio de Supabase; se oculta si no hay.
 */
export function ExploreTipSection() {
	const { colors, scheme } = useTheme();
	const isDark = scheme === "dark";
	const { data: tip, isLoading } = useRandomTip();

	if (isLoading || !tip) return null;

	const cardBackground = isDark ? colors.surfaceWarning : colors.yellowLight;
	const cardBorder = colors.yellowDark + (isDark ? "4D" : "33");

	return (
		<View style={styles.wrap}>
			<View
				style={[
					styles.card,
					{
						backgroundColor: cardBackground,
						borderColor: cardBorder,
					},
				]}
			>
				<View style={styles.titleRow}>
					<View
						style={[
							styles.bulbCircle,
							{
								backgroundColor: colors.card + (isDark ? "00" : "80"),
								boxShadow: `0px 0px 12px ${colors.yellowDark}${isDark ? "33" : "4D"}`,
							},
						]}
					>
						<Ionicons
							name="bulb"
							size={20}
							color={isDark ? colors.yellow : colors.yellowDark}
						/>
					</View>
					<AppText variant="h4" weight="bold">
						{strings.explore.tipTitle}
					</AppText>
				</View>
				<AppText
					variant="bodyMedium"
					style={[styles.tipBody, { color: colors.foreground }]}
				>
					{tip.content}
				</AppText>
			</View>
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