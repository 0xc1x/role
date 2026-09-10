import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { withAlpha } from "@/core/theme/alpha";

export function CategoryBadge({ label }: { label: string }) {
	const { colors } = useTheme();
	return (
		<View
			style={[styles.categoryBadge, { backgroundColor: `${withAlpha(colors.primary, 0.102)}` }]}
		>
			<AppText
				style={{
					color: colors.primary,
					fontWeight: "700",
					letterSpacing: 1,
					fontSize: 11,
					textTransform: "uppercase",
				}}
			>
				{label}
			</AppText>
		</View>
	);
}

/**
 * Variante flat de la Card del kit (sin sombra, radius 20, padding xl,
 * fondo background/card según tema): existe porque la Card elevada del kit
 * cambia el aspecto de esta pantalla. Revisar si el kit gana un variant
 * "flat" antes de duplicar el patrón en otra pantalla.
 */
export function InfoCard({
	title,
	trailing,
	children,
}: {
	title: string;
	trailing?: ReactNode;
	children: ReactNode;
}) {
	const { colors, scheme } = useTheme();
	return (
		<View
			style={[
				styles.infoCard,
				{
					backgroundColor: scheme === "dark" ? colors.card : colors.background,
					borderColor: colors.borderSolid,
				},
			]}
		>
			<View style={styles.infoCardHead}>
				<AppText variant="h4" weight="bold" style={{ flex: 1 }}>
					{title}
				</AppText>
				{trailing}
			</View>
			{children}
		</View>
	);
}

export function InfoRow({
	icon,
	label,
	value,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	label: string;
	value: string;
}) {
	const { colors } = useTheme();
	return (
		<View style={styles.infoRow}>
			<View style={[styles.infoRowIcon, { backgroundColor: `${withAlpha(colors.primary, 0.078)}` }]}>
				<Ionicons name={icon} size={15} color={colors.primary} />
			</View>
			<View style={styles.infoRowBody}>
				<AppText variant="labelSmall" style={{ color: colors.mutedForeground }}>
					{label}
				</AppText>
				<AppText variant="bodyMedium" weight="semiBold">
					{value}
				</AppText>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	categoryBadge: {
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 6,
	},
	infoCard: {
		width: "100%",
		borderWidth: 1,
		borderRadius: 20,
		padding: spacing.xl,
		gap: spacing.lg,
		marginTop: spacing.xl,
	},
	infoCardHead: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	infoRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.md,
	},
	infoRowIcon: {
		padding: 8,
		borderRadius: radii.md,
	},
	infoRowBody: {
		flex: 1,
		gap: 1,
	},
});
