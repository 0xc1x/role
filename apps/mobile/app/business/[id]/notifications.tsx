import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Switch, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	Card,
	ErrorState,
	LoadingView,
	Screen,
	ScreenHeader,
} from "@/core/ui";
import {
	useBusinessNotifications,
	useUpdateBusinessNotifications,
} from "@/features/business/hooks";
import type { BusinessNotificationPreferences } from "@0xc1x/role-commons";
import { spacing, radii } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

export default function BusinessNotificationsScreen() {
	const { colors } = useTheme();
	const { id } = useLocalSearchParams<{ id: string }>();
	const businessId = id ?? "";
	const { data, isLoading, isError, error, refetch } = useBusinessNotifications(
		businessId,
	);
	const update = useUpdateBusinessNotifications(businessId);

	if (isLoading) return <LoadingView />;
	if (isError)
		return <ErrorState error={error} onRetry={() => void refetch()} />;
	if (!data) return <LoadingView />;

	const toggle = (
		key: keyof BusinessNotificationPreferences,
		value: boolean,
	) => {
		update.mutate({ [key]: value } as Partial<BusinessNotificationPreferences>);
	};

	return (
		<Screen scroll>
			<View style={styles.container}>
				<ScreenHeader title={strings.business.notifications} />
				<AppText
					variant="bodySmall"
					style={{ color: colors.mutedForeground, marginTop: 4 }}
				>
					{strings.business.notificationsSubtitle}
				</AppText>

				{/* ── Info banner ─────────────────────────────────── */}
				<View style={[styles.banner, { backgroundColor: colors.primary }]}>
					<View style={styles.bannerIcon}>
						<Ionicons name="notifications" size={24} color="#fff" />
					</View>
					<View style={styles.bannerText}>
						<AppText
							variant="bodyMedium"
							weight="semiBold"
							style={{ color: "#fff" }}
						>
							{strings.business.notificationsBannerTitle}
						</AppText>
						<AppText variant="bodySmall" style={{ color: "#ffffffE6" }}>
							{strings.business.notificationsBannerBody}
						</AppText>
					</View>
				</View>

				{/* ── Event types ────────────────────────────────── */}
				<Card style={styles.card}>
					<AppText variant="h4" weight="bold" style={styles.cardHeader}>
						{strings.business.notificationsEventTypes}
					</AppText>
					{[
						{
							key: "new_orders_enabled" as const,
							icon: "bag-handle-outline" as const,
							title: strings.business.notificationsNewOrders,
							description: strings.business.notificationsNewOrdersHint,
						},
						{
							key: "pickup_ready_enabled" as const,
							icon: "notifications-outline" as const,
							title: strings.business.notificationsPickupReady,
							description: strings.business.notificationsPickupReadyHint,
						},
						{
							key: "reviews_enabled" as const,
							icon: "chatbubble-outline" as const,
							title: strings.business.notificationsReviews,
							description: strings.business.notificationsReviewsHint,
						},
						{
							key: "low_stock_enabled" as const,
							icon: "alert-circle-outline" as const,
							title: strings.business.notificationsLowStock,
							description: strings.business.notificationsLowStockHint,
						},
						{
							key: "daily_summary_enabled" as const,
							icon: "trending-up-outline" as const,
							title: strings.business.notificationsDailySummary,
							description: strings.business.notificationsDailySummaryHint,
						},
					].map((item) => (
						<ToggleRow
							key={item.key}
							icon={item.icon}
							title={item.title}
							description={item.description}
							value={Boolean(data[item.key])}
							onChange={(v) => toggle(item.key, v)}
							showDivider
						/>
					))}
				</Card>

				{/* ── Channels ───────────────────────────────────── */}
				<Card style={styles.card}>
					<AppText variant="h4" weight="bold" style={styles.cardHeader}>
						{strings.business.notificationsChannels}
					</AppText>
					{[
						{
							key: "push_enabled" as const,
							icon: "phone-portrait-outline" as const,
							label: strings.business.notificationsPush,
						},
						{
							key: "email_enabled" as const,
							icon: "mail-outline" as const,
							label: strings.business.notificationsEmail,
						},
						{
							key: "sms_enabled" as const,
							icon: "chatbox-outline" as const,
							label: strings.business.notificationsSms,
						},
						{
							key: "whatsapp_enabled" as const,
							icon: "logo-whatsapp" as const,
							label: strings.business.notificationsWhatsapp,
						},
					].map((item) => (
						<ToggleRow
							key={item.key}
							icon={item.icon}
							title={item.label}
							value={Boolean(data[item.key])}
							onChange={(v) => toggle(item.key, v)}
							showDivider
						/>
					))}
				</Card>
			</View>
		</Screen>
	);
}

function ToggleRow({
	icon,
	title,
	description,
	value,
	onChange,
	showDivider = false,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	title: string;
	description?: string;
	value: boolean;
	onChange: (v: boolean) => void;
	showDivider?: boolean;
}) {
	const { colors } = useTheme();
	return (
		<View
			style={[
				styles.toggleRow,
				showDivider && {
					borderBottomWidth: 1,
					borderBottomColor: colors.borderSolid,
				},
			]}
		>
			<Ionicons name={icon} size={18} color={colors.primary} />
			<View style={styles.toggleText}>
				<AppText variant="bodyMedium" weight="medium">
					{title}
				</AppText>
				{description ? (
					<AppText
						variant="bodySmall"
						style={{ color: colors.mutedForeground }}
					>
						{description}
					</AppText>
				) : null}
			</View>
			<Switch
				value={value}
				onValueChange={onChange}
				trackColor={{ true: colors.primary }}
				thumbColor="#fff"
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl },
	banner: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		padding: spacing.md,
		borderRadius: radii.lg,
		marginTop: spacing.lg,
	},
	bannerIcon: {
		width: 48,
		height: 48,
		borderRadius: 24,
		backgroundColor: "rgba(255,255,255,0.2)",
		alignItems: "center",
		justifyContent: "center",
	},
	bannerText: { flex: 1, gap: 2 },
	card: { marginTop: spacing.lg, paddingHorizontal: spacing.md },
	cardHeader: { marginBottom: spacing.sm },
	toggleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		paddingVertical: spacing.md,
	},
	toggleText: { flex: 1, gap: 2 },
});