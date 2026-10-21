import { type Href, router } from "expo-router";
import { Bell, CircleHelp, Star, Tag, TrendingUp } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { radii, spacing } from "@/src/core/theme/spacing";
import type { BusinessMemberRole } from "@/src/features/business/domain/business";
import {
	meetsMinRole,
	type PanelMinRole,
} from "@/src/features/business/domain/panel-role";

/**
 * Un acceso rápido: la tile, su ícono y a dónde lleva.
 *
 * El `minRole` es el rol mínimo que alcanza a la tile (§9.3) y va DECLARADO
 * aquí, junto a la tile: una fila que no declara su mínimo es una fila que
 * se le enseña a cualquiera.
 */
type QuickAction = {
	icon: ReactNode;
	title: string;
	subtitle: string;
	route: string;
	minRole: PanelMinRole;
};

export function QuickActionsGrid({
	businessId,
	role,
}: {
	businessId: string;
	role: BusinessMemberRole;
}) {
	const { colors } = useTheme();
	const base = `/business/${businessId}`;

	const large: QuickAction = {
		icon: <TrendingUp size={18} color={colors.successText} />,
		title: strings.business.quickStats,
		subtitle: strings.business.quickStatsSub,
		route: `${base}/stats`,
		// Las métricas son del dueño: el resto del negocio las ve en sus
		// cuentas, no en el panel de otro.
		minRole: "owner",
	};

	const grid: QuickAction[] = [
		// Oculto hasta habilitar la pasarela de pagos
		// {
		// 	icon: <CreditCard size={18} color={colors.foreground} />,
		// 	title: strings.business.quickPayments,
		// 	subtitle: strings.business.quickPaymentsSub,
		// 	route: `${base}/payouts`,
		// },
		{
			icon: <Tag size={18} color={colors.foreground} />,
			title: strings.business.quickCoupons,
			subtitle: strings.business.quickCouponsSub,
			route: `${base}/coupons`,
			// Los cupones son una promoción del negocio: los decide su dueño.
			minRole: "owner",
		},
		{
			icon: <Star size={18} color={colors.foreground} />,
			title: strings.business.quickReviews,
			subtitle: strings.business.quickReviewsSub,
			route: `${base}/reviews`,
			// Las reseñas son el trabajo de quien está en el mostrador.
			minRole: "staff",
		},
		{
			icon: <Bell size={18} color={colors.foreground} />,
			title: strings.business.quickAlerts,
			subtitle: strings.business.quickAlertsSub,
			route: `${base}/notifications`,
			// Las notificaciones son la configuración del negocio.
			minRole: "owner",
		},
		{
			icon: <CircleHelp size={18} color={colors.foreground} />,
			title: strings.business.quickSupport,
			subtitle: strings.business.quickSupportSub,
			route: `${base}/help`,
			// El soporte lo puede pedir cualquiera que opere el negocio.
			minRole: "staff",
		},
	];

	const visibleLarge = meetsMinRole(role, large.minRole) ? large : null;
	const visibleGrid = grid.filter((item) => meetsMinRole(role, item.minRole));

	// Sin tiles no hay sección: ni accesos ni el título que los anuncia.
	if (!visibleLarge && visibleGrid.length === 0) return null;

	return (
		<>
			<View style={styles.sectionTitle}>
				<AppText variant="h4" weight="bold">
					{strings.business.quickActions}
				</AppText>
			</View>
			<View style={styles.quickGrid}>
				{visibleLarge ? (
					<Pressable
						onPress={() => router.push(visibleLarge.route as Href)}
						style={[
							styles.quickTileLarge,
							{ backgroundColor: colors.card, borderColor: colors.borderSolid },
						]}
					>
						<View style={styles.quickInfo}>
							<AppText variant="bodyMedium" weight="bold">
								{visibleLarge.title}
							</AppText>
							<AppText
								variant="bodySmall"
								style={{ color: colors.mutedForeground }}
							>
								{visibleLarge.subtitle}
							</AppText>
						</View>
						<View
							style={[styles.quickIconLarge, { backgroundColor: colors.muted }]}
						>
							{visibleLarge.icon}
						</View>
					</Pressable>
				) : null}
				<View style={styles.quickCellWrap}>
					{visibleGrid.map((item) => (
						<Pressable
							key={item.title}
							onPress={() => router.push(item.route as Href)}
							style={[
								styles.quickTile,
								{
									backgroundColor: colors.card,
									borderColor: colors.borderSolid,
								},
							]}
						>
							<View style={styles.quickInfo}>
								<AppText variant="bodySmall" weight="bold">
									{item.title}
								</AppText>
								<AppText
									variant="bodySmall"
									numberOfLines={1}
									style={{ fontSize: 11, color: colors.mutedForeground }}
								>
									{item.subtitle}
								</AppText>
							</View>
							<View
								style={[styles.quickIcon, { borderColor: colors.borderSolid }]}
							>
								{item.icon}
							</View>
						</Pressable>
					))}
				</View>
			</View>
		</>
	);
}

const styles = StyleSheet.create({
	sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.md },
	quickGrid: { gap: spacing.sm },
	quickCellWrap: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.sm,
	},
	quickTileLarge: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		padding: spacing.md,
		borderWidth: 1,
		borderRadius: radii.lg,
	},
	quickTile: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		flexGrow: 1,
		gap: spacing.xs,
		padding: spacing.md,
		borderWidth: 1,
		borderRadius: radii.md,
	},
	quickInfo: { flexShrink: 1, gap: 2 },
	quickIconLarge: {
		width: 34,
		height: 34,
		borderRadius: radii.sm,
		alignItems: "center",
		justifyContent: "center",
	},
	quickIcon: {
		width: 34,
		height: 34,
		borderRadius: radii.sm,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	pressed: { opacity: 0.85 },
});
