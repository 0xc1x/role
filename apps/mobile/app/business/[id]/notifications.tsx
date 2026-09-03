import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import { toast } from "sonner-native";
import * as Notifications from "expo-notifications";

import { Switch } from "@/components/ui/switch";
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
import { useAuthStore } from "@/features/auth/store";
import { syncDeviceToken } from "@/features/notifications";
import type { BusinessNotificationPreferences } from "@0xc1x/role-commons";
import { spacing, radii } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

async function ensurePushPermission(): Promise<"granted" | "denied"> {
	if (Platform.OS === "web") {
		if (typeof window === "undefined" || !("Notification" in window)) return "denied";
		if (Notification.permission === "default") await Notification.requestPermission();
		return Notification.permission === "granted" ? "granted" : "denied";
	}
	const current = await Notifications.getPermissionsAsync();
	if (current.status === "granted") return "granted";
	const requested = await Notifications.requestPermissionsAsync();
	return requested.status === "granted" ? "granted" : "denied";
}

export default function BusinessNotificationsScreen() {
	const { colors } = useTheme();
	const { id } = useLocalSearchParams<{ id: string }>();
	const businessId = id ?? "";
	const { data, isLoading, isError, error, refetch } = useBusinessNotifications(
		businessId,
	);
	const update = useUpdateBusinessNotifications(businessId);
	const profile = useAuthStore((s) => s.profile);
	const userId = profile?.id ?? "";

	if (isLoading) return <LoadingView />;
	if (isError)
		return <ErrorState error={error} onRetry={() => void refetch()} />;
	if (!data) return <LoadingView />;

	const toggle = async (
		key: keyof BusinessNotificationPreferences,
		value: boolean,
	) => {
		if (key === "sms_enabled" || key === "whatsapp_enabled") return;
		if (key === "push_enabled" && value && userId) {
			const permission = await ensurePushPermission();
			if (permission === "denied") {
				toast.error(
					Platform.OS === "web"
						? strings.notificationsSettings.blockedBrowser
						: strings.notificationsSettings.blockedDevice,
					{ duration: 8000 },
				);
				return;
			}
			try {
				const registered = await syncDeviceToken(userId);
				if (!registered) return;
				toast.success(strings.notificationsSettings.pushEnabled);
			} catch (e) {
				const code = (e as { code?: string }).code;
				if (code !== "23505") {
					toast.error(e instanceof Error ? e.message : "No se pudo registrar el dispositivo");
					return;
				}
			}
		}
		update.mutate({ [key]: value } as Partial<BusinessNotificationPreferences>);
	};

	return (
		<Screen scroll>
			<View style={styles.container}>
				<ScreenHeader
					title={strings.business.notifications}
					fallback="/(business)/management"
				/>
				<AppText
					variant="bodySmall"
					style={{ color: colors.mutedForeground, marginTop: spacing.lg }}
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
							upcoming: true as const,
						},
						{
							key: "whatsapp_enabled" as const,
							icon: "logo-whatsapp" as const,
							label: strings.business.notificationsWhatsapp,
							upcoming: true as const,
						},
					].map((item) => (
						<ToggleRow
							key={item.key}
							icon={item.icon}
							title={item.label}
							value={Boolean(data[item.key])}
							onChange={(v) => toggle(item.key, v)}
							showDivider
							upcoming={Boolean((item as { upcoming?: boolean }).upcoming)}
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
	upcoming = false,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	title: string;
	description?: string;
	value: boolean;
	onChange: (v: boolean) => void;
	showDivider?: boolean;
	upcoming?: boolean;
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
			<View style={[{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: (colors as unknown as Record<string, string>).inputBackground ?? colors.muted } as never]}>
				<Ionicons name={icon} size={18} color={upcoming ? colors.mutedForeground : colors.primary} />
			</View>
			<View style={styles.toggleText}>
				<View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
					<AppText variant="bodyMedium" weight="medium" style={upcoming ? { color: colors.mutedForeground } : undefined}>
						{title}
					</AppText>
					{upcoming ? (
						<View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.inputBackground }}>
							<AppText style={{ fontSize: 10, fontWeight: "600", color: colors.mutedForeground }}>{strings.notificationsSettings.upcoming}</AppText>
						</View>
					) : null}
				</View>
				{description ? (
					<AppText
						variant="bodySmall"
						style={{ color: colors.mutedForeground }}
					>
						{description}
					</AppText>
				) : null}
			</View>
			<Switch checked={Boolean(value)} disabled={upcoming} onCheckedChange={onChange} />
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