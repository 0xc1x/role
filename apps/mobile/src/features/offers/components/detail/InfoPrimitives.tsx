import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";

import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import { withAlpha } from "@/src/core/theme/alpha";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";
import { Text } from "react-native-svg";

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
	description,
	footer,
}: {
	title: string;
	trailing?: ReactNode;
	children: ReactNode;
	description?: ReactNode;
	footer?: ReactNode;
}) {
	const { colors, scheme } = useTheme();
	return (
		<Card
			style={[
				styles.infoCard,
			]}
		>
			<CardHeader style={styles.infoCardHead}>
				<AppText variant="h4" weight="bold" style={{ flex: 1, }}>
					{title}
				</AppText>
				{trailing}
			</CardHeader>
			{ description && (
				<CardDescription>
					{description}
				</CardDescription>
			) }
			<CardContent>
				{children}
			</CardContent>
			{footer && (
				<CardFooter>
					{footer}
				</CardFooter>
			)}
		</Card>
	);
}

export function InfoRow({
	icon: Icon,
	label,
	value,
}: {
	icon: LucideIcon;
	label: string;
	value: string;
}) {
	const { colors } = useTheme();
	return (
		<View style={styles.infoRow}>
			<View style={[styles.infoRowIcon, { backgroundColor: `${withAlpha(colors.primary, 0.078)}` }]}>
				<Icon size={15} color={colors.primary} />
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
		borderRadius: radii.sm,
	},
	infoCard: {
		marginVertical: spacing.md,
	},
	infoCardHead: {
		flexDirection: "row",
	},
	infoRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		paddingVertical: spacing.sm,
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
