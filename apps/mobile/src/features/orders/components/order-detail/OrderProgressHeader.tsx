import {
	CircleCheck,
	Package,
	Star,
	type LucideIcon,
} from "lucide-react-native";
import type { Order } from "@0xc1x/role-commons";
import { Fragment, useEffect, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { radii, spacing } from "@/src/core/theme/spacing";
import {
	isActiveStatus,
	orderStatusLabels,
	type OrderStatusType,
} from "@/src/features/orders/domain/order";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface ProgressStep {
	status: OrderStatusType;
	label: string;
	icon: LucideIcon;
	done: boolean;
}

const STEP_DELAY = 130;
const STEP_DURATION = 250;

/** Progreso Confirmado → Listo para recoger → Completado derivado del status. */
export function OrderProgressHeader({ order }: { order: Order }) {
	const { colors, scheme } = useTheme();
	const active = isActiveStatus(order.status);

	const confirmedDone = order.status !== "pending";
	const readyDone =
		order.status === "ready_for_pickup" ||
		order.status === "picked_up" ||
		order.status === "completed";
	const completedDone = order.status === "completed";

	// Lazy init vía useState: se crean una sola vez al montar (patrón ExploreCategoryGrid).
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
			ordered.map(
				(anim) =>
					Animated.timing(anim, {
						toValue: 1,
						duration: STEP_DURATION,
						easing: Easing.out(Easing.cubic),
						useNativeDriver: Platform.OS !== "web",
					}),
			),
		).start();
	}, [order.status, stepAnims, lineAnims]);

	const steps: ProgressStep[] = [
		{
			status: "confirmed",
			label: strings.orders.timelineConfirmed,
			icon: CircleCheck,
			done: confirmedDone,
		},
		{
			status: "ready_for_pickup",
			label: strings.orders.timelineReady,
			icon: Package,
			done: readyDone,
		},
		{
			status: "completed",
			label: strings.orders.timelineCompleted,
			icon: Star,
			done: completedDone,
		},
	];

	const firstPending = steps.findIndex((s) => !s.done);

	return (
		<Card
			style={[
				{
					backgroundColor: scheme === "dark" ? colors.card : colors.background,
					borderColor: colors.borderSolid,
				},
			]}>
			<CardHeader>
				<AppText variant="h4" weight="bold" style={{ flex: 1, color: colors.mutedForeground }}>
					{strings.orders.statusTitle}
				</AppText>
				{/* Sin campo ETA en OrderDetail: el chip se omite hasta que el
				    contrato exponga el dato (no se inventa). */}
			</CardHeader>
			<CardContent style={styles.row}>
				{steps.map((step, index) => {
					const isCurrent = active && index === firstPending;
					const circleBackground = step.done
						? colors.success
						: isCurrent
							? colors.primary
							: colors.muted;
					const iconColor = step.done || isCurrent
						? colors.primaryForeground
						: colors.mutedForeground;
					const anim = stepAnims[index];
					const lineAnim = index > 0 ? lineAnims[index - 1] : null;
					return (
						<Fragment key={step.status}>
							{lineAnim ? (
								<Animated.View
									style={[
										styles.line,
										{
											backgroundColor: steps[index]?.done
												? colors.success
												: colors.border,
											opacity: lineAnim,
											transform: [{ scaleX: lineAnim }],
										},
									]}
								/>
							) : null}
							<Animated.View
								style={[
									styles.step,
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
								accessibilityRole="text"
								accessibilityLabel={orderStatusLabels[step.status]}
							>
								<View
									style={[styles.circle, { backgroundColor: circleBackground }]}
								>
									<step.icon
										size={18}
										color={iconColor}
										fill={step.done ? iconColor : "none"}
									/>
								</View>
								<AppText
									variant="bodySmall"
									weight={step.done || isCurrent ? "bold" : "regular"}
									numberOfLines={2}
									style={[
										styles.label,
										{
											color:
												step.done || isCurrent
													? colors.foreground
													: colors.mutedForeground,
										},
									]}
								>
									{step.label}
								</AppText>
							</Animated.View>
						</Fragment>
					);
				})}
			</CardContent>
		</Card>
	);
}

const styles = StyleSheet.create({
	row: { flexDirection: "row", alignItems: "flex-start" },
	step: { alignItems: "center", width: 92, gap: spacing.xs },
	circle: {
		width: 36,
		height: 36,
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
	},
	line: { flex: 1, height: 2, marginTop: 17, borderRadius: 1 },
	label: { textAlign: "center" },
});
