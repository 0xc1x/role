import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Card, StatusBadge } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";

export function LocationCard({
	name,
	address,
	phone,
	isActive,
	imageUrl,
	onPress,
}: {
	name: string;
	address: string;
	phone: string | null;
	isActive: boolean;
	/** Logo del negocio; si no hay, placeholder con ícono. */
	imageUrl?: string | null;
	onPress: () => void;
}) {
	const { colors } = useTheme();
	return (
		<Card onPress={onPress} style={styles.card}>
			<View style={styles.body}>
				<View style={[styles.icon, { backgroundColor: colors.muted }]}>
					{imageUrl ? (
						<Image source={{ uri: imageUrl }} style={styles.iconImage} />
					) : (
						<Ionicons name="storefront" size={22} color={colors.mutedForeground} />
					)}
				</View>
				<View style={styles.info}>
					<View style={styles.rowBetween}>
						<AppText
							variant="bodyMedium"
							weight="semiBold"
							numberOfLines={1}
							style={styles.flex1}
						>
							{name}
						</AppText>
						<StatusBadge
							label={isActive ? "Activo" : "Inactivo"}
							tone={isActive ? "success" : "neutral"}
						/>
					</View>
					<View style={[styles.rowStart, { marginTop: 4 }]}>
						<Ionicons
							name="location-outline"
							size={14}
							color={colors.mutedForeground}
						/>
						<AppText
							variant="bodySmall"
							numberOfLines={1}
							style={[styles.flex1, { color: colors.mutedForeground }]}
						>
							{address}
						</AppText>
					</View>
					{phone ? (
						<View style={[styles.rowStart, { marginTop: 4 }]}>
							<Ionicons
								name="call-outline"
								size={14}
								color={colors.mutedForeground}
							/>
							<AppText
								variant="bodySmall"
								style={{ color: colors.mutedForeground }}
							>
								{phone}
							</AppText>
						</View>
					) : null}
				</View>
			</View>
			<Pressable
				onPress={onPress}
				style={({ pressed }) => [
					styles.footer,
					{ borderTopColor: colors.borderSolid },
					pressed && { opacity: 0.85 },
				]}
			>
			<AppText
				variant="bodySmall"
				weight="semiBold"
				style={{ color: colors.foreground }}
			>
				{strings.business.viewDetailsAndConfig}
			</AppText>
			<Ionicons name="chevron-forward" size={16} color={colors.foreground} />
			</Pressable>
		</Card>
	);
}

const styles = StyleSheet.create({
	card: { padding: 0, overflow: "hidden" },
	body: {
		flexDirection: "row",
		padding: spacing.md,
		gap: spacing.md,
	},
	icon: {
		width: 72,
		height: 72,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
	},
	iconImage: { width: "100%", height: "100%" },
	info: { flex: 1 },
	footer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm + 2,
		borderTopWidth: 1,
	},
	rowBetween: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
	},
	rowStart: { flexDirection: "row", alignItems: "center", gap: 4 },
	flex1: { flex: 1 },
});