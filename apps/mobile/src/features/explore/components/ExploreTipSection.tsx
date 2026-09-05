import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
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
				<TouchableOpacity
					style={styles.titleRow}
					activeOpacity={0.7}
					onPress={() => setIsExpanded((prev) => !prev)}
				>
					<View style={styles.titleLeft}>
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
					<Ionicons
						name={isExpanded ? "chevron-up" : "chevron-down"}
						size={20}
						color={isDark ? colors.yellow : colors.yellowDark}
					/>
				</TouchableOpacity>
				{isExpanded && (
					<AppText
						variant="bodyMedium"
						style={[styles.tipBody, { color: colors.foreground }]}
					>
						{tip.content}
					</AppText>
				)}
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
		justifyContent: "space-between",
		width: "100%",
	},
	titleLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8, // ajusta según tu spacing habitual entre bulbCircle y el texto
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