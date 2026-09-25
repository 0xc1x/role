import { ChevronRight, MapPin, Phone, Store } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";

import { Skeleton } from "@/components/ui/skeleton";
import { strings } from "@/src/core/i18n/strings";
import { AppText, StatusBadge } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import { CardPressable } from "@/components/ui/card-presable";

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
		<CardPressable
			onPress={onPress}
			style={[
				styles.card,
				{
					backgroundColor: colors.card,
					borderColor: colors.borderSolid,
				},
			]}
		>
			<View style={styles.body}>
				<View style={[styles.icon, { backgroundColor: colors.muted }]}>
					{imageUrl ? (
						<Image source={{ uri: imageUrl }} style={styles.iconImage} />
					) : (
						<Store size={22} color={colors.mutedForeground} />
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
							label={
								isActive ? strings.business.active : strings.business.inactive
							}
							tone={isActive ? "success" : "neutral"}
						/>
					</View>
					<View style={[styles.rowStart, { marginTop: 4 }]}>
						<MapPin size={14} color={colors.mutedForeground} />
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
							<Phone size={14} color={colors.mutedForeground} />
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
			<View style={[styles.footer, { borderTopColor: colors.borderSolid }]}>
				<AppText
					variant="bodySmall"
					weight="semiBold"
					style={{ color: colors.foreground }}
				>
					{strings.business.viewDetailsAndConfig}
				</AppText>
				<ChevronRight size={16} color={colors.foreground} />
			</View>
		</CardPressable>
	);
}

/**
 * Skeleton con las dimensiones aproximadas de la card real
 * (icono 72 + columna info + footer).
 * Mismo patrón que ProductCardSkeleton / BusinessGridCardSkeleton.
 */
export function LocationCardSkeleton() {
	const { colors } = useTheme();
	return (
		<View
			style={[
				styles.card,
				{
					backgroundColor: colors.card,
					borderColor: colors.borderSolid,
					borderWidth: 1,
					borderRadius: radii.lg,
				},
			]}
		>
			<View style={styles.body}>
				<Skeleton style={styles.skeletonIcon} />
				<View style={styles.skeletonInfo}>
					<Skeleton style={styles.skeletonTitle} />
					<Skeleton style={styles.skeletonLine} />
					<Skeleton style={styles.skeletonLineShort} />
				</View>
			</View>
			<View style={[styles.footer, { borderTopColor: colors.borderSolid }]}>
				<Skeleton style={styles.skeletonFooter} />
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	card: { padding: 0, overflow: "hidden", borderRadius: radii.xl },
	body: {
		flexDirection: "row",
		padding: spacing.md,
		gap: spacing.md,
	},
	icon: {
		width: 72,
		height: 72,
		borderRadius: radii.lg,
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
	rowStart: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
	flex1: { flex: 1 },
	skeletonIcon: {
		width: 72,
		height: 72,
		borderRadius: radii.lg,
	},
	skeletonInfo: {
		flex: 1,
		gap: spacing.sm,
		justifyContent: "center",
	},
	skeletonTitle: {
		height: 16,
		width: "60%",
		borderRadius: radii.sm,
	},
	skeletonLine: {
		height: 12,
		width: "85%",
		borderRadius: radii.sm,
	},
	skeletonLineShort: {
		height: 12,
		width: "40%",
		borderRadius: radii.sm,
	},
	skeletonFooter: {
		height: 14,
		width: "50%",
		borderRadius: radii.sm,
	},
});
