import { useState } from "react";
import {
	Image,
	Modal,
	Pressable,
	StyleSheet,
	View,
} from "react-native";
import { router } from "expo-router";
import { toast } from "sonner-native";
import { Ionicons } from "@expo/vector-icons";

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
	Button,
	Card,
	Screen,
	ScreenHeader,
	StatusBadge,
	TextField,
} from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import {
	formatMoneyPrecise,
	formatShortDate,
	formatTime,
} from "@/core/utils/formatters";
import { orderStatusLabels } from "@/features/orders/domain/order";
import { orderStatusTone } from "@/features/orders/components/OrderCard";
import { isTerminalStatus, type OrderDetail } from "@/features/orders/domain/order";
import {
	useUpdateOrderStatus,
	useValidatePickupCode,
} from "@/features/business/hooks";
import { PickupScannerSheet } from "./PickupScannerSheet";

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * Business order detail (ported from Rolé v1 `BusinessOrderDetailScreen`):
 * product, customer, pickup info, change timeline and the action bar with
 * pickup-code validation and cancellation.
 */
export function OrderDetail({
	businessId,
	item,
}: {
	businessId: string;
	item: OrderDetail;
}) {
	const { colors } = useTheme();
	const [validateOpen, setValidateOpen] = useState(false);
	const [scannerOpen, setScannerOpen] = useState(false);
	const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
	const updateStatus = useUpdateOrderStatus(businessId);
	const validate = useValidatePickupCode(businessId);
	const { order } = item;
	const isTerminal = isTerminalStatus(order.status);

	const openScanner = () => {
		setValidateOpen(false);
		setScannerOpen(true);
	};

	const handleScannedValidation = () => {
		setScannerOpen(false);
		toast.success(strings.business.ordersDeliverySuccess);
	};

	const markReady = () =>
		updateStatus.mutate({
			orderId: order.id,
			status: "ready_for_pickup",
		});

	const confirmCancel = () => setConfirmCancelOpen(true);

	return (
		<View style={styles.root}>
			<Screen
				scroll
				contentContainerStyle={[
					styles.content,
					isTerminal ? null : { paddingBottom: 120 },
				]}
			>
				<View style={styles.headerRow}>
					<ScreenHeader title={strings.business.orderDetail} />
					<StatusBadge
						label={orderStatusLabels[order.status]}
						tone={orderStatusTone(order.status)}
					/>
				</View>

				<ProductCard item={item} />
				<CustomerInfoCard item={item} />
				<PickupInfoCard item={item} />
				<TimelineCard item={item} />
				<OrderInfoCard item={item} />
			</Screen>

			{!isTerminal ? (
				<View
					style={[
						styles.bottomBar,
						{
							backgroundColor: colors.card,
							borderColor: colors.borderSolid,
							shadowColor: colors.cardShadow,
						},
					]}
				>
					{order.status === "pending" || order.status === "confirmed" ? (
						<Button
							label={strings.business.ordersMarkAsReady}
							variant="primary"
							size="lg"
							icon={
								<Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
							}
							onPress={markReady}
							loading={updateStatus.isPending}
							fullWidth
						/>
					) : null}

					{order.status === "ready_for_pickup" ? (
						<Button
							label={strings.business.ordersValidateDelivery}
							variant="primary"
							size="lg"
							icon={<Ionicons name="qr-code-outline" size={20} color="#FFFFFF" />}
							onPress={() => setValidateOpen(true)}
							fullWidth
						/>
					) : null}

					<Button
						label={strings.business.ordersCancelOrder}
						variant="outline"
						size="lg"
						onPress={confirmCancel}
						loading={updateStatus.isPending}
						fullWidth
					/>
				</View>
			) : null}

			{validateOpen ? (
				<ValidateCodeDialog
					onClose={() => setValidateOpen(false)}
					onScan={openScanner}
					onSubmit={(code) =>
						validate.mutate(
							{ orderId: order.id, pickupCode: code },
							{
								onSuccess: (result) => {
									if (result.success) {
										setValidateOpen(false);
										toast.success(strings.business.ordersDeliverySuccess);
									} else {
										toast.error(strings.business.ordersCodeInvalid);
									}
								},
							},
						)
					}
					loading={validate.isPending}
				/>
			) : null}

			{scannerOpen ? (
				<PickupScannerSheet
					businessId={businessId}
					orderId={order.id}
					onClose={() => setScannerOpen(false)}
					onValidated={handleScannedValidation}
				/>
			) : null}

			<AlertDialog
				open={confirmCancelOpen}
				onOpenChange={setConfirmCancelOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{strings.business.ordersCancelOrder}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{strings.business.ordersCancelConfirm}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Text>{strings.common.no}</Text>
						</AlertDialogCancel>
						<AlertDialogAction
							onPress={() =>
								updateStatus.mutate(
									{ orderId: order.id, status: "cancelled" },
									{ onSuccess: () => router.back() },
								)
							}
						>
							<Text>{strings.business.ordersCancelOrder}</Text>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</View>
	);
}

// ─── Producto ────────────────────────────────────────────────────────

function ProductCard({ item }: { item: OrderDetail }) {
	const { colors } = useTheme();
	return (
		<Card style={styles.card}>
			<AppText variant="h4" weight="bold">
				{strings.business.ordersProductTitle}
			</AppText>
			<View style={styles.productRow}>
				{item.offerImageUrl ? (
					<Image source={{ uri: item.offerImageUrl }} style={styles.productImage} />
				) : (
					<View style={[styles.productImage, styles.productPlaceholder]}>
						<Ionicons
							name="fast-food-outline"
							size={28}
							color={colors.mutedForeground}
						/>
					</View>
				)}
				<View style={styles.productBody}>
					<AppText variant="bodyMedium" weight="bold">
						{item.offerTitle}
					</AppText>
					<AppText variant="h3" weight="bold" style={{ color: colors.primary }}>
						{formatMoneyPrecise(item.order.price)}
					</AppText>
				</View>
			</View>
		</Card>
	);
}

// ─── Información del cliente ─────────────────────────────────────────

function CustomerInfoCard({ item }: { item: OrderDetail }) {
	return (
		<Card style={styles.card}>
			<AppText variant="h4" weight="bold">
				{strings.business.ordersCustomerInfo}
			</AppText>
			<InfoRow
				icon="person-outline"
				label={strings.business.ordersName}
				text={item.customerName ?? strings.business.ordersNoName}
			/>
			<InfoRow
				icon="call-outline"
				label={strings.business.phone}
				text={item.customerPhone ?? strings.business.ordersNoPhone}
			/>
			<InfoRow
				icon="mail-outline"
				label={strings.business.email}
				text={item.customerEmail ?? strings.business.ordersNoEmail}
			/>
		</Card>
	);
}

// ─── Información de recogida ─────────────────────────────────────────

function PickupInfoCard({ item }: { item: OrderDetail }) {
	const { order } = item;
	const pickupTime =
		order.pickup_time != null
			? `${formatShortDate(order.pickup_time)} · ${formatTime(order.pickup_time)}`
			: strings.business.ordersPickupPending;
	return (
		<Card style={styles.card}>
			<AppText variant="h4" weight="bold">
				{strings.business.ordersPickupInfo}
			</AppText>
			<InfoRow
				icon="time-outline"
				label={strings.business.ordersPickupSchedule}
				text={pickupTime}
			/>
			<InfoRow
				icon="location-outline"
				label={strings.business.ordersPickupPlace}
				text={item.businessAddress ?? strings.business.ordersNoAddress}
			/>
		</Card>
	);
}

// ─── Historial de cambios ────────────────────────────────────────────

interface TimelineEntry {
	icon: IoniconName;
	title: string;
	note: string;
	timestamp: string;
	color: string;
	background: string;
}

function buildTimeline(item: OrderDetail, colors: ReturnType<typeof useTheme>["colors"]): TimelineEntry[] {
	const { order } = item;
	const created = order.created_at;
	const readyTime = order.pickup_time ?? created;
	const entries: TimelineEntry[] = [
		{
			icon: "time-outline",
			title: strings.business.ordersTimelinePending,
			note: strings.business.ordersTimelinePendingNote,
			timestamp: created,
			color: colors.warning,
			background: colors.surfaceWarning,
		},
	];

	const confirmed = ["confirmed", "ready_for_pickup", "picked_up", "completed"];
	const ready = ["ready_for_pickup", "picked_up", "completed"];

	if (confirmed.includes(order.status)) {
		entries.push({
			icon: "checkmark-circle-outline",
			title: strings.business.ordersTimelineConfirmed,
			note: strings.business.ordersTimelineConfirmedNote,
			timestamp: created,
			color: colors.info,
			background: colors.infoSurface,
		});
	}

	if (ready.includes(order.status)) {
		entries.push({
			icon: "checkmark-circle",
			title: strings.business.ordersTimelineReady,
			note: strings.business.ordersTimelineReadyNote,
			timestamp: readyTime,
			color: colors.primary,
			background: colors.secondary + "4D",
		});
	}

	if (order.status === "completed") {
		entries.push({
			icon: "checkmark-done-circle",
			title: strings.business.ordersTimelineCompleted,
			note: strings.business.ordersTimelineCompletedNote,
			timestamp: readyTime,
			color: colors.success,
			background: colors.surfaceSuccess,
		});
	}

	if (order.status === "cancelled") {
		entries.push({
			icon: "close-circle-outline",
			title: strings.business.ordersTimelineCancelled,
			note: strings.business.ordersTimelineCancelledNote,
			timestamp: created,
			color: colors.destructive,
			background: colors.destructiveSurface,
		});
	}

	if (order.status === "expired") {
		entries.push({
			icon: "timer-outline",
			title: strings.business.ordersTimelineExpired,
			note: strings.business.ordersTimelineExpiredNote,
			timestamp: created,
			color: colors.destructive,
			background: colors.destructiveSurface,
		});
	}

	return entries;
}

function TimelineCard({ item }: { item: OrderDetail }) {
	const { colors } = useTheme();
	const entries = buildTimeline(item, colors);
	return (
		<Card style={styles.card}>
			<View style={styles.timelineHeader}>
				<Ionicons name="calendar-outline" size={20} color={colors.primary} />
				<AppText variant="h4" weight="bold">
					{strings.business.ordersTimelineTitle}
				</AppText>
			</View>
			{entries.map((entry, index) => (
				<TimelineEntryRow
					key={`${entry.title}-${index}`}
					entry={entry}
					isLast={index === entries.length - 1}
				/>
			))}
		</Card>
	);
}

function TimelineEntryRow({
	entry,
	isLast,
}: {
	entry: TimelineEntry;
	isLast: boolean;
}) {
	const { colors } = useTheme();
	return (
		<View style={styles.timelineRow}>
			<View style={styles.timelineRail}>
				<View style={[styles.timelineDot, { backgroundColor: entry.background }]}>
					<Ionicons name={entry.icon} size={18} color={entry.color} />
				</View>
				{isLast ? null : (
					<View style={[styles.timelineLine, { backgroundColor: colors.borderSolid }]} />
				)}
			</View>
			<View style={styles.timelineBody}>
				<View style={styles.timelineTitleRow}>
					<AppText variant="bodyMedium" weight="semiBold">
						{entry.title}
					</AppText>
					<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
						{formatTime(entry.timestamp)}
					</AppText>
				</View>
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
					{entry.note}
				</AppText>
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground, fontSize: 11 }}>
					{formatShortDate(entry.timestamp)}
				</AppText>
			</View>
		</View>
	);
}

// ─── Número y fecha ──────────────────────────────────────────────────

function OrderInfoCard({ item }: { item: OrderDetail }) {
	const { colors } = useTheme();
	return (
		<View
			style={[
				styles.orderInfo,
				{
					backgroundColor: colors.inputBackground,
					borderColor: colors.borderSolid,
				},
			]}
		>
			<View style={styles.orderInfoCol}>
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
					{strings.business.ordersOrderNumber}
				</AppText>
				<AppText variant="bodyMedium" weight="medium">
					#{item.order.id.substring(0, 8).toUpperCase()}
				</AppText>
			</View>
			<View style={styles.orderInfoCol}>
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
					{strings.business.ordersCreatedAt}
				</AppText>
				<AppText variant="bodyMedium" weight="medium">
					{formatShortDate(item.order.created_at)}
				</AppText>
			</View>
		</View>
	);
}

// ─── Fila informativa ────────────────────────────────────────────────

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
			<View style={[styles.infoIcon, { backgroundColor: colors.inputBackground }]}>
				<Ionicons name={icon} size={16} color={colors.mutedForeground} />
			</View>
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

// ─── Diálogo de validación de código ─────────────────────────────────

function ValidateCodeDialog({
	onClose,
	onScan,
	onSubmit,
	loading,
}: {
	onClose: () => void;
	onScan: () => void;
	onSubmit: (code: string) => void;
	loading: boolean;
}) {
	const { colors } = useTheme();
	const [code, setCode] = useState("");

	return (
		<Modal
			visible
			transparent
			statusBarTranslucent
			animationType="fade"
			onRequestClose={onClose}
		>
			<View style={styles.backdrop}>
				<Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
				<View
					style={[
						styles.dialog,
						{ backgroundColor: colors.card, borderColor: colors.borderSolid },
					]}
				>
					<AppText variant="h3" weight="bold">
						{strings.business.ordersCodeTitle}
					</AppText>
					<AppText
						variant="bodySmall"
						style={{ color: colors.mutedForeground, marginTop: 2 }}
					>
						{strings.business.ordersCodeHint}
					</AppText>

					<Button
						label={strings.business.ordersScanQr}
						variant="outline"
						size="lg"
						icon={<Ionicons name="qr-code-outline" size={18} color={colors.foreground} />}
						onPress={onScan}
						fullWidth
						style={styles.scanBtn}
					/>

					<View style={styles.orRow}>
						<View style={[styles.orLine, { backgroundColor: colors.borderSolid }]} />
						<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
							{strings.business.ordersCodeManual}
						</AppText>
						<View style={[styles.orLine, { backgroundColor: colors.borderSolid }]} />
					</View>

					<TextField
						value={code}
						onChangeText={setCode}
						placeholder={strings.business.ordersCodePlaceholder}
						keyboardType="number-pad"
						maxLength={6}
						containerStyle={styles.codeInputContainer}
					/>
					<View style={styles.dialogActions}>
						<Button
							label={strings.common.cancel}
							variant="outline"
							style={{ flex: 1 }}
							onPress={onClose}
						/>
						<Button
							label={strings.common.confirm}
							variant="primary"
							style={{ flex: 1 }}
							onPress={() => onSubmit(code)}
							loading={loading}
						/>
					</View>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	content: {
		padding: spacing.md,
		gap: spacing.md,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
	},
	card: {
		padding: spacing.lg,
		gap: spacing.md,
	},
	productRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	productImage: {
		width: 80,
		height: 80,
		borderRadius: radii.lg,
	},
	productPlaceholder: {
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#E5E5E5",
	},
	productBody: {
		flex: 1,
		gap: 4,
	},
	infoRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	infoIcon: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
	},
	infoBody: { flex: 1, gap: 1 },
	timelineHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	timelineRow: {
		flexDirection: "row",
		gap: spacing.md,
	},
	timelineRail: {
		alignItems: "center",
	},
	timelineDot: {
		width: 38,
		height: 38,
		borderRadius: 19,
		alignItems: "center",
		justifyContent: "center",
	},
	timelineLine: {
		width: 2,
		flex: 1,
		marginVertical: spacing.xs,
	},
	timelineBody: {
		flex: 1,
		paddingBottom: spacing.lg,
		gap: 1,
	},
	timelineTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	orderInfo: {
		flexDirection: "row",
		borderRadius: radii.lg,
		borderWidth: 1,
		padding: spacing.lg,
		gap: spacing.lg,
	},
	orderInfoCol: { flex: 1, gap: 2 },
	bottomBar: {
		paddingHorizontal: spacing.xl,
		paddingVertical: spacing.md,
		borderTopWidth: 1,
		gap: spacing.sm,
		shadowOffset: { width: 0, height: -4 },
		shadowOpacity: 1,
		shadowRadius: 10,
		elevation: 4,
	},
	backdrop: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(0,0,0,0.5)",
		padding: spacing.xl,
	},
	dialog: {
		width: "100%",
		maxWidth: 400,
		borderRadius: radii.xl,
		borderWidth: 1,
		padding: spacing.xl,
		gap: spacing.sm,
	},
	codeInputContainer: { marginTop: spacing.md },
	scanBtn: { marginTop: spacing.md },
	orRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		marginTop: spacing.md,
	},
	orLine: { flex: 1, height: StyleSheet.hairlineWidth },
	dialogActions: {
		flexDirection: "row",
		gap: spacing.sm,
		marginTop: spacing.md,
	},
});