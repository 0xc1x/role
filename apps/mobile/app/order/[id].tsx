import { Ionicons } from "@expo/vector-icons";
import type { Order } from "@0xc1x/role-commons";
import { router, useLocalSearchParams } from "expo-router";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { useState } from "react";
import QRCode from "react-native-qrcode-svg";

import {
 AlertDialog,
 AlertDialogAction,
 AlertDialogCancel,
 AlertDialogContent,
 AlertDialogDescription,
 AlertDialogFooter,
 AlertDialogHeader,
 AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Text } from "@/components/ui/text";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	goBackOr,
	Button,
	Card,
	ErrorState,
	LoadingView,
	Screen,
	StatusBadge,
} from "@/core/ui";
import { useCancelOrder, useOrder } from "@/features/hooks";
import { orderStatusTone } from "@/features/orders/components/OrderCard";
import {
	isActiveStatus,
	orderDiscount,
	orderStatusLabels,
	type OrderDetail,
} from "@/features/orders/domain/order";
import {
	formatMoneyPrecise,
	formatShortDate,
	formatTime,
} from "@/core/utils/formatters";
import { spacing, radii } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import type { ColorTokens } from "@/core/theme/colors";

type IoniconName = keyof typeof Ionicons.glyphMap;

export default function OrderDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
	const { data, isLoading, isError, error, refetch } = useOrder(id ?? "");
	const cancel = useCancelOrder();

	if (isLoading) return <LoadingView />;
	if (isError || !data)
		return <ErrorState error={error} onRetry={() => void refetch()} />;

	const { order } = data;
	const canCancel = ["pending", "confirmed"].includes(order.status);

	const handleCancel = () => setConfirmCancelOpen(true);

	return (
		<Screen scroll>
			<View style={styles.container}>
				<DetailHeader order={order} />

				{isActiveStatus(order.status) && order.pickup_code ? (
					<PickupCodeCard order={order} />
				) : null}

				<BusinessInfoCard item={data} />

				<Card style={styles.cardBlock}>
					<ProductItemsCard item={data} />
				</Card>

				<PriceDetailsCard order={order} />

				<InstructionsCard order={order} />

				<TimelineCard order={order} />

				{canCancel ? (
					<Button
						label={strings.orders.cancel}
						variant="danger"
						onPress={() => void handleCancel()}
						loading={cancel.isPending}
						fullWidth
						style={styles.cancelBtn}
					/>
				) : null}

				{order.status === "completed" ? (
					<>
						<ReviewBanner />
						<Button
							label={strings.orders.orderAgain}
							variant="primary"
							onPress={() => void refetch()}
							fullWidth
						/>
						<Button
							label={strings.orders.writeReview}
							variant="outline"
							onPress={() => router.push(`/review-order/${order.id}`)}
							fullWidth
							style={styles.reviewBtn}
						/>
					</>
					) : null}
			</View>

			<AlertDialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{strings.orders.cancel}</AlertDialogTitle>
						<AlertDialogDescription>
							{strings.orders.cancelConfirm}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Text>{strings.common.no}</Text>
						</AlertDialogCancel>
						<AlertDialogAction
							onPress={() =>
								cancel.mutate(order.id, { onSuccess: () => void refetch() })
							}
						>
							<Text>{strings.orders.cancel}</Text>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Screen>
	);
}

// ─── Header ──────────────────────────────────────────────────────────

function DetailHeader({ order }: { order: Order }) {
	const { colors } = useTheme();
	return (
		<View style={styles.header}>
			<View style={styles.headerLeft}>
				<Pressable
					onPress={() => goBackOr("/(consumer)/profile/orders")}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel={strings.common.back}
					style={[
						styles.headerBack,
						{ backgroundColor: colors.card, borderColor: colors.borderSolid },
					]}
				>
					<Ionicons name="chevron-back" size={20} color={colors.foreground} />
				</Pressable>
				<View>
					<AppText variant="h3" weight="bold">
						{strings.orders.detailTitle}
					</AppText>
					<AppText style={{ color: colors.mutedForeground }}>
						{strings.orders.orderNumber.replace("{n}", order.order_number)}
					</AppText>
				</View>
			</View>
			<StatusBadge
				label={orderStatusLabels[order.status]}
				tone={orderStatusTone(order.status)}
			/>
		</View>
	);
}

// ─── Código de recogida (activo) ─────────────────────────────────────

function PickupCodeCard({ order }: { order: Order }) {
	const { colors } = useTheme();
	if (!order.pickup_code) return null;
	const qrValue = `role://order/${order.id}/${order.pickup_code}`;
	return (
		<View
			style={[
				styles.pickupCard,
				{ backgroundColor: colors.card, borderColor: colors.borderSolid },
			]}
		>
			<AppText style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
				{strings.orders.yourCode.toUpperCase()}
			</AppText>
			<AppText style={[styles.pickupCode, { color: colors.primary }]}>
				{order.pickup_code}
			</AppText>
			<View
				style={[
					styles.qrBox,
					{ borderColor: colors.borderSolid, backgroundColor: colors.card },
				]}
			>
				<QRCode
					value={qrValue}
					size={176}
					color="#131316"
					backgroundColor={colors.card}
				/>
			</View>
			<AppText style={[styles.sectionNote, { color: colors.mutedForeground }]}>
				{strings.orders.pickupCodeHint}
			</AppText>
		</View>
	);
}

// ─── Comercio ────────────────────────────────────────────────────────

function BusinessInfoCard({ item }: { item: OrderDetail }) {
	const { colors } = useTheme();
	const { order } = item;
	const isActive = isActiveStatus(order.status);

	const openDirections = () => {
		const url = item.businessLocationId
			? `https://www.google.com/maps/dir/?api=1&destination=place_id:${encodeURIComponent(item.businessLocationId)}`
			: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(item.businessAddress ?? "")}`;
		void Linking.openURL(url);
	};

	return (
		<Card style={styles.cardBlock}>
			<View style={styles.businessTitleRow}>
				<View
					style={[
						styles.businessIcon,
						{ backgroundColor: colors.secondary + "4D" },
					]}
				>
					<Ionicons name="storefront-outline" size={18} color={colors.primary} />
				</View>
				<AppText
					variant="h4"
					weight="bold"
					numberOfLines={2}
					style={styles.businessName}
				>
					{item.businessName}
				</AppText>
			</View>

			{item.businessAddress ? (
				<InfoRow
					icon="location-outline"
					label={strings.orders.businessAddressLabel}
					text={item.businessAddress}
				/>
			) : null}
			{item.businessPhone ? (
				<InfoRow
					icon="call-outline"
					label={strings.orders.businessPhoneLabel}
					text={item.businessPhone}
				/>
			) : null}
			{order.pickup_time ? (
				<InfoRow
					icon="time-outline"
					label={strings.orders.pickupTimeLabel}
					text={`${formatShortDate(order.pickup_time)} · ${formatTime(order.pickup_time)} hs`}
				/>
			) : null}

			<View style={styles.businessActions}>
				<Button
					label={strings.orders.viewBusiness}
					variant="secondary"
					size="sm"
					style={styles.businessActionBtn}
					onPress={() => router.push(`/business-profile/${order.business_id}`)}
				/>
				{isActive ? (
					<Button
						label={strings.orders.getDirections}
						variant="outline"
						size="sm"
						style={styles.businessActionBtn}
						onPress={openDirections}
					/>
				) : null}
			</View>
		</Card>
	);
}

function InfoRow({
	icon,
	label,
	text,
}: {
	icon: IoniconName;
	label: string;
	text: string;
}) {
	const { colors } = useTheme();
	return (
		<View style={styles.infoRow}>
			<Ionicons name={icon} size={16} color={colors.mutedForeground} />
			<View style={styles.infoBody}>
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
					{label}
				</AppText>
				<AppText variant="bodyMedium" weight="medium">
					{text}
				</AppText>
			</View>
		</View>
	);
}

// ─── Producto ────────────────────────────────────────────────────────

function ProductItemsCard({ item }: { item: OrderDetail }) {
	const { colors } = useTheme();
	return (
		<View>
			<AppText style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
				{strings.orders.productTitle.toUpperCase()}
			</AppText>
			<View
				style={[
					styles.itemRow,
					{
						backgroundColor: colors.card,
						borderColor: colors.borderSolid,
					},
				]}
			>
				<View style={[styles.itemQty, { backgroundColor: colors.secondary }]}>
					<AppText
						style={[styles.itemQtyText, { color: colors.secondaryForeground }]}
					>
						1
					</AppText>
				</View>
				<AppText
					variant="bodyMedium"
					weight="semiBold"
					numberOfLines={2}
					style={styles.itemTitle}
				>
					{item.offerTitle}
				</AppText>
			</View>
		</View>
	);
}

// ─── Resumen económico ───────────────────────────────────────────────

function PriceDetailsCard({ order }: { order: Order }) {
	const { colors } = useTheme();
	const discount = orderDiscount(order);
	return (
		<Card style={styles.cardBlock}>
			<AppText style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
				{strings.orders.summaryTitle.toUpperCase()}
			</AppText>
			<View style={styles.priceRow}>
				<AppText style={[styles.priceLabel, { color: colors.mutedForeground }]}>
					{strings.orders.originalPriceLabel}
				</AppText>
				<AppText
					style={[
						styles.priceValue,
						{
							color: colors.mutedForeground,
							textDecorationLine: "line-through",
						},
					]}
				>
					{formatMoneyPrecise(order.original_price)}
				</AppText>
			</View>
			<View style={styles.priceRow}>
				<AppText style={[styles.priceLabel, { color: colors.success }]}>
					{strings.orders.discountLabel}
				</AppText>
				<AppText style={[styles.priceValue, { color: colors.success }]}>
					-{formatMoneyPrecise(discount)}
				</AppText>
			</View>
			<View style={[styles.divider, { backgroundColor: colors.border }]} />
			<View style={styles.priceRow}>
				<AppText variant="h4" weight="bold" style={styles.totalLabel}>
					{strings.orders.totalLabel}
				</AppText>
				<AppText style={[styles.totalValue, { color: colors.primary }]}>
					{formatMoneyPrecise(order.price)}
				</AppText>
			</View>
			<View
				style={[
					styles.ecoBox,
					{
						backgroundColor: colors.surfaceSuccess,
						borderColor: colors.surfaceSuccessBorder,
					},
				]}
			>
				<Ionicons name="leaf-outline" size={18} color={colors.success} />
				<AppText style={[styles.ecoText, { color: colors.success }]}>
					{strings.orders.ecoSaved.replace("{saved}", formatMoneyPrecise(discount))}
				</AppText>
			</View>
		</Card>
	);
}

// ─── Instrucciones ───────────────────────────────────────────────────

function InstructionsCard({ order }: { order: Order }) {
	const { colors } = useTheme();
	const completed = order.status === "completed";
	return (
		<Card style={styles.cardBlock}>
			<View style={styles.instructionsRow}>
				<Ionicons
					name={
						completed ? "checkmark-circle-outline" : "information-circle-outline"
					}
					size={22}
					color={completed ? colors.success : colors.primary}
				/>
				<View style={styles.instructionsBody}>
					<AppText variant="bodyMedium" weight="bold">
						{completed
							? strings.orders.instructionsCompletedTitle
							: strings.orders.instructionsTitle}
					</AppText>
					<AppText style={[styles.instructionsNote, { color: colors.mutedForeground }]}>
						{completed
							? strings.orders.instructionsCompletedBody
							: strings.orders.instructionsBody}
					</AppText>
				</View>
			</View>
		</Card>
	);
}

// ─── Historial / timeline ────────────────────────────────────────────

interface TimelineSection {
	icon: IoniconName;
	title: string;
	note: string;
	time: string;
	color: string;
	background: string;
}

function formatTimestamp(iso: string): string {
	return `${formatShortDate(iso)} · ${formatTime(iso)}`;
}

function buildTimeline(order: Order, colors: ColorTokens): TimelineSection[] {
	const created = formatTimestamp(order.created_at);
	const ready =
		order.status === "ready_for_pickup" ||
		order.status === "picked_up" ||
		order.status === "completed";

	const sections: TimelineSection[] = [
		{
			icon: "checkmark-circle-outline",
			title: strings.orders.timelineConfirmed,
			note: strings.orders.timelineConfirmedNote,
			time: created,
			color: colors.primary,
			background: colors.secondary + "4D",
		},
	];

	if (ready) {
		sections.push({
			icon: "time-outline",
			title: strings.orders.timelineReady,
			note: strings.orders.timelineReadyNote,
			time: order.pickup_time ? formatTimestamp(order.pickup_time) : created,
			color: colors.primary,
			background: colors.secondary + "4D",
		});
	}

	if (order.status === "picked_up" || order.status === "completed") {
		sections.push({
			icon: "checkmark-circle",
			title: strings.orders.timelineCompleted,
			note: strings.orders.timelineCompletedNote,
			time: order.pickup_time ? formatTimestamp(order.pickup_time) : created,
			color: colors.success,
			background: colors.surfaceSuccess,
		});
	}

	if (order.status === "cancelled") {
		sections.push({
			icon: "close-circle-outline",
			title: strings.orders.timelineCancelled,
			note: strings.orders.timelineCancelledNote,
			time: created,
			color: colors.destructive,
			background: colors.destructiveSurface,
		});
	}
	if (order.status === "expired") {
		sections.push({
			icon: "timer-outline",
			title: strings.orders.timelineExpired,
			note: strings.orders.timelineExpiredNote,
			time: created,
			color: colors.destructive,
			background: colors.destructiveSurface,
		});
	}

	return sections;
}

function TimelineCard({ order }: { order: Order }) {
	const { colors } = useTheme();
	const sections = buildTimeline(order, colors);
	return (
		<Card style={styles.cardBlock}>
			<View style={styles.timelineHeader}>
				<Ionicons name="calendar-outline" size={20} color={colors.primary} />
				<AppText variant="h4" weight="bold">
					{strings.orders.timelineTitle}
				</AppText>
			</View>
			{sections.map((section, index) => (
				<TimelineSectionRow
					key={`${section.title}-${index}`}
					section={section}
					isLast={index === sections.length - 1}
				/>
			))}
		</Card>
	);
}

function TimelineSectionRow({
	section,
	isLast,
}: {
	section: TimelineSection;
	isLast: boolean;
}) {
	const { colors } = useTheme();
	return (
		<View style={styles.timelineRow}>
			<View style={styles.timelineRail}>
				<View
					style={[
						styles.timelineDot,
						{ backgroundColor: section.background },
					]}
				>
					<Ionicons name={section.icon} size={18} color={section.color} />
				</View>
				{isLast ? null : (
					<View style={[styles.timelineLine, { backgroundColor: colors.border }]} />
				)}
			</View>
			<View style={styles.timelineBody}>
				<AppText variant="bodyMedium" weight="bold">
					{section.title}
				</AppText>
				<AppText style={[styles.timelineNote, { color: colors.mutedForeground }]}>
					{section.note}
				</AppText>
				<AppText style={[styles.timelineTime, { color: colors.mutedForeground }]}>
					{section.time}
				</AppText>
			</View>
		</View>
	);
}

// ─── Banner de reseña (completado) ───────────────────────────────────

function ReviewBanner() {
	const { colors } = useTheme();
	return (
		<View
			style={[
				styles.reviewBanner,
				{
					backgroundColor: colors.secondary + "26",
					borderColor: colors.secondary + "4D",
				},
			]}
		>
			<Ionicons
				name="chatbubble-ellipses-outline"
				size={20}
				color={colors.primary}
			/>
			<View style={styles.reviewBannerBody}>
				<AppText variant="bodyMedium" weight="bold">
					{strings.orders.reviewBannerTitle}
				</AppText>
				<AppText style={[styles.timelineNote, { color: colors.mutedForeground }]}>
					{strings.orders.reviewBannerMessage}
				</AppText>
			</View>
		</View>
	);
}

// ─── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
	container: { padding: spacing.xl, gap: spacing.lg },
	cardBlock: { gap: spacing.sm },

	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	headerLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		flex: 1,
	},
	headerBack: {
		width: 40,
		height: 40,
		borderRadius: 20,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},

	pickupCard: {
		borderRadius: 24,
		borderWidth: 1,
		padding: spacing.lg,
		alignItems: "center",
		gap: spacing.md,
	},
	pickupCode: {
		fontSize: 34,
		fontWeight: "800",
		letterSpacing: 8,
	},
	qrBox: {
		padding: spacing.md,
		borderRadius: radii.lg,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},

	businessTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		marginBottom: spacing.xs,
	},
	businessIcon: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	businessName: { flex: 1 },
	businessActions: {
		flexDirection: "row",
		gap: spacing.sm,
		marginTop: spacing.sm,
	},
	businessActionBtn: { flex: 1 },

	infoRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
		paddingVertical: spacing.xs,
	},
	infoBody: { flex: 1 },

	itemRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: radii.lg,
		borderWidth: 1,
		padding: spacing.md,
	},
	itemQty: {
		borderRadius: 10,
		paddingHorizontal: 10,
		paddingVertical: 6,
	},
	itemQtyText: { fontWeight: "700", fontSize: 14 },
	itemTitle: { flex: 1 },

	priceRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
	},
	priceLabel: { fontSize: 13, flex: 1 },
	priceValue: { fontSize: 13 },
	totalLabel: { flex: 1 },
	totalValue: { fontSize: 18, fontWeight: "800" },
	divider: { height: 1, marginVertical: spacing.sm },
	ecoBox: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderWidth: 1,
		borderRadius: radii.lg,
		padding: spacing.md,
		marginTop: spacing.sm,
	},
	ecoText: { flex: 1, fontSize: 13, fontWeight: "600" },

	sectionLabel: {
		fontSize: 12,
		fontWeight: "700",
		letterSpacing: 1.2,
		marginBottom: spacing.xs,
	},
	sectionNote: {
		fontSize: 12,
		textAlign: "center",
	},

	instructionsRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
	},
	instructionsBody: { flex: 1 },
	instructionsNote: {
		fontSize: 12,
		lineHeight: 18,
		marginTop: 2,
	},

	timelineHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		marginBottom: spacing.xs,
	},
	timelineRow: { flexDirection: "row", gap: spacing.md },
	timelineRail: { alignItems: "center" },
	timelineDot: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
	},
	timelineLine: { width: 2, flex: 1, marginVertical: spacing.xs },
	timelineBody: { flex: 1, paddingBottom: spacing.lg },
	timelineNote: { fontSize: 12, lineHeight: 18 },
	timelineTime: { fontSize: 12, marginTop: 4, fontWeight: "500" },

	reviewBanner: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
		borderWidth: 1,
		borderRadius: 20,
		padding: spacing.md,
	},
	reviewBannerBody: { flex: 1 },

	cancelBtn: { marginTop: spacing.sm },
	reviewBtn: { marginTop: spacing.sm },
});