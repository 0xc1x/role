import { Fragment, useEffect, useState } from "react";
import {
	Animated,
	Easing,
	Platform,
	Pressable,
	StyleSheet,
	View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { strings } from "@/core/i18n/strings";
import { AppText, type BadgeTone } from "@/core/ui";
import {
	isActiveStatus,
	orderStatusLabels,
	orderStatusTone,
	type OrderDetail,
} from "@/features/orders/domain/order";
import { formatMoney } from "@/core/utils/formatters";
import { spacing, radii } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import type { ColorTokens } from "@/core/theme/colors";
import { withAlpha } from "@/core/theme/alpha";

/** Iconos del footer: check / bag / clock (mismos labels que OrderProgressHeader). */
type IoniconName = keyof typeof Ionicons.glyphMap;

interface CardStep {
	icon: IoniconName;
	doneIcon: IoniconName;
	label: string;
	done: boolean;
}

const STEP_DELAY = 130;
const STEP_DURATION = 250;

/** Estación destacada según el estado: pendiente/confirmado → 0, listo/recogido → 1, completado → 2. */
function activeStepIndex(status: OrderDetail["order"]["status"]): number {
	switch (status) {
		case "ready_for_pickup":
		case "picked_up":
			return 1;
		case "completed":
			return 2;
		default:
			return 0;
	}
}

/** Mismo mapeo tono → colores que StatusBadge (tokens, dark-safe). */
function toneColors(
	colors: ColorTokens,
	tone: BadgeTone,
): { bg: string; fg: string } {
	switch (tone) {
		case "brand":
			return { bg: colors.secondary, fg: colors.secondaryForeground };
		case "success":
			return { bg: colors.surfaceSuccess, fg: colors.success };
		case "warning":
			return { bg: colors.surfaceWarning, fg: colors.warning };
		case "danger":
			return { bg: colors.destructiveSurface, fg: colors.destructive };
		case "info":
			return { bg: colors.infoSurface, fg: colors.info };
		default:
			return { bg: colors.muted, fg: colors.mutedForeground };
	}
}

/** Pill de estado con dot + label (sin handler: la card entera navega). */
function StatusPill({ label, tone }: { label: string; tone: BadgeTone }) {
	const { colors } = useTheme();
	const t = toneColors(colors, tone);
	return (
		<View style={[styles.pill, { backgroundColor: t.bg }]}>
			<View style={[styles.pillDot, { backgroundColor: t.fg }]} />
			<AppText variant="bodySmall" weight="semiBold" style={{ color: t.fg }}>
				{label}
			</AppText>
		</View>
	);
}

/** Ledger card for the orders list and the profile history (port of ProfileOrderCard). */
export function OrderCard({ item }: { item: OrderDetail }) {
	const { colors } = useTheme();
	const isActive = isActiveStatus(item.order.status);
	const { offerImageUrl, order } = item;

	const confirmedDone = order.status !== "pending";
	const readyDone =
		order.status === "ready_for_pickup" ||
		order.status === "picked_up" ||
		order.status === "completed";
	const completedDone = order.status === "completed";

	const steps: CardStep[] = [
		{
			icon: "checkmark-circle-outline",
			doneIcon: "checkmark-circle",
			label: strings.orders.timelineConfirmed,
			done: confirmedDone,
		},
		{
			icon: "bag-handle-outline",
			doneIcon: "bag-handle",
			label: strings.orders.timelineReady,
			done: readyDone,
		},
		{
			icon: "time-outline",
			doneIcon: "time",
			label: strings.orders.timelineCompleted,
			done: completedDone,
		},
	];

	// Lazy init vía useState: se crean una sola vez al montar (patrón OrderProgressHeader).
	const [stepAnims] = useState(() => [
		new Animated.Value(0),
		new Animated.Value(0),
		new Animated.Value(0),
	]);
	const [lineAnims] = useState(() => [new Animated.Value(0), new Animated.Value(0)]);

	// Llenado secuencial estación por estación al montar y al cambiar de fase.
	useEffect(() => {
		const ordered = [
			stepAnims[0],
			lineAnims[0],
			stepAnims[1],
			lineAnims[1],
			stepAnims[2],
		];
		for (const anim of ordered) anim.setValue(0);
		Animated.stagger(
			STEP_DELAY,
			ordered.map((anim) =>
				Animated.timing(anim, {
					toValue: 1,
					duration: STEP_DURATION,
					easing: Easing.out(Easing.cubic),
					useNativeDriver: Platform.OS !== "web",
				}),
			),
		).start();
	}, [order.status, stepAnims, lineAnims]);

	const firstPending = steps.findIndex((s) => !s.done);
	const currentLabel =
		firstPending >= 0 ? steps[firstPending]?.label : steps[0]?.label;

	return (
		<Pressable
			onPress={() => router.push(`/order/${order.id}`)}
			style={[
				styles.card,
				{
					borderColor: colors.borderSolid,
					backgroundColor: colors.card,
				},
			]}
		>
			<View style={styles.row}>
				{offerImageUrl ? (
					<Image
						source={{ uri: offerImageUrl }}
						style={styles.thumb}
						contentFit="cover"
					/>
				) : (
					<View
						style={[
							styles.thumb,
							styles.thumbFallback,
							{ backgroundColor: colors.muted },
						]}
					>
						<Ionicons
							name="storefront-outline"
							size={32}
							color={colors.mutedForeground}
						/>
					</View>
				)}

				<View style={styles.content}>
					<AppText
						variant="h2"
						weight="semiBold"
						numberOfLines={2}
						style={styles.offerTitle}
					>
						{item.offerTitle}
					</AppText>
					<View style={styles.topRow}>
						<Ionicons
							name="storefront-outline"
							size={15}
							color={colors.mutedForeground}
						/>
						<AppText
							variant="bodyMedium"
							weight="semiBold"
							numberOfLines={1}
							style={styles.businessName}
						>
						{item.businessName}
					</AppText>
				</View>

					<AppText
						variant="caption"
						style={{ color: colors.mutedForeground }}
					>
						{strings.orders.orderNumber.replace("{n}", order.order_number)}
					</AppText>

					<View style={styles.statusRow}>
						<StatusPill
							label={orderStatusLabels[order.status]}
							tone={orderStatusTone(order.status)}
						/>
						<AppText variant="priceLarge" style={{ color: colors.primary, paddingRight: spacing.sm }}>
							{formatMoney(order.price)}
						</AppText>
					</View>
				</View>
			</View>

			{isActive ? (
				<View
					style={[styles.footer, { borderTopColor: colors.border }]}
					accessibilityRole="text"
					accessibilityLabel={currentLabel}
				>
					{steps.map((step, index) => {
						const isCurrent = index === firstPending;
						const highlighted = step.done || isCurrent;
						const circleBackground = step.done
							? colors.success
							: isCurrent
								? colors.primary
								: colors.muted;
						const iconColor = highlighted
							? colors.primaryForeground
							: colors.mutedForeground;
						const anim = stepAnims[index];
						const lineAnim = index > 0 ? lineAnims[index - 1] : null;
						return (
							<Fragment key={step.label}>
								{lineAnim ? (
									<View
										style={[
											styles.connector,
											{ backgroundColor: colors.border },
										]}
									>
										<Animated.View
											style={[
												styles.connectorFill,
												{
													backgroundColor: steps[index]?.done
														? colors.success
														: colors.border,
													opacity: lineAnim,
													transform: [{ scaleX: lineAnim }],
												},
											]}
										/>
									</View>
								) : null}
								<Animated.View
									style={[
										styles.station,
										{
											opacity: anim,
											transform: [
												{
													scale: anim.interpolate({
														inputRange: [0, 1],
														outputRange: [0.6, 1],
													}),
												},
											],
										},
									]}
								>
									<View
										style={[
											styles.stationCircle,
											{ backgroundColor: circleBackground },
										]}
									>
										<Ionicons
											name={step.done ? step.doneIcon : step.icon}
											size={20}
											color={iconColor}
										/>
									</View>
								</Animated.View>
							</Fragment>
						);
					})}
				</View>
			) : null}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: radii.xl,
		borderWidth: 1,
		overflow: "hidden",
	},
	row: {
		flexDirection: "row",
		paddingTop: 0,
		paddingBottom: 0,
		paddingLeft: 0,
		paddingRight: spacing.md,
		gap: spacing.md,
	},
	thumb: {
		width: 150,
		minHeight: 112,
		alignSelf: "stretch",
	},
	thumbFallback: { alignItems: "center", justifyContent: "center" },
	content: {
		flex: 1,
		minWidth: 0,
		justifyContent: "center",
		gap: spacing.xs,
		paddingVertical: spacing.md,
		paddingRight: spacing.sm,
	},
	topRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	businessName: { flex: 1, minWidth: 0, letterSpacing: -0.2 },
	offerTitle: { letterSpacing: -0.2 },
	statusRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	pill: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "center",
		gap: 6,
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: radii.pill,
	},
	pillDot: { width: 6, height: 6, borderRadius: radii.pill, marginLeft: 2 },
	footer: {
		flexDirection: "row",
		alignItems: "flex-start",
		borderTopWidth: 1,
		paddingVertical: spacing.sm,
		paddingHorizontal: spacing.md,
	},
	station: { flex: 1, alignItems: "center", gap: 2 },
	stationCircle: {
		width: 28,
		height: 28,
		borderRadius: radii.md,
		alignItems: "center",
		justifyContent: "center",
	},
	connector: {
		flex: 1,
		height: 2,
		marginTop: 13,
		borderRadius: radii.sm,
		overflow: "hidden",
	},
	connectorFill: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
	},
	stationLabel: { textAlign: "center" },
});
