import { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { toast } from "sonner-native";
import * as Notifications from "expo-notifications";
import { Ionicons } from "@expo/vector-icons";

import { Switch } from "@/components/ui/switch";
import { strings } from "@/core/i18n/strings";
import { AppText, Card, Screen, ScreenHeader } from "@/core/ui";
import { useAuthStore } from "@/features/auth/store";
import {
	useNotificationPreferences,
	useUpdateNotificationPreferences,
} from "@/features/profile/hooks";
import { syncDeviceToken } from "@/features/notifications";
import type { ConsumerNotificationPreferences } from "@0xc1x/role-commons";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

type ToggleKey = Exclude<
	keyof ConsumerNotificationPreferences,
	"user_id" | "created_at" | "updated_at"
>;

interface ToggleConfig {
	key: ToggleKey;
	label: string;
	subtitle: string;
	icon: string;
	upcoming?: boolean;
}

const CHANNELS: ToggleConfig[] = [
	{
		key: "push_enabled",
		label: strings.notificationsSettings.push,
		subtitle: strings.notificationsSettings.pushSubtitle,
		icon: "phone-portrait-outline",
	},
	{
		key: "email_enabled",
		label: strings.notificationsSettings.email,
		subtitle: strings.notificationsSettings.emailSubtitle,
		icon: "mail-outline",
	},
	{
		key: "sms_enabled",
		label: strings.notificationsSettings.sms,
		subtitle: strings.notificationsSettings.smsSubtitle,
		icon: "text-outline",
		upcoming: true,
	},
	{
		key: "whatsapp_enabled",
		label: strings.notificationsSettings.whatsapp,
		subtitle: strings.notificationsSettings.whatsappSubtitle,
		icon: "logo-whatsapp",
		upcoming: true,
	},
];

const SMART_ALERTS: ToggleConfig[] = [
	{
		key: "favorite_alerts_enabled",
		label: strings.notificationsSettings.favoriteAlerts,
		subtitle: strings.notificationsSettings.favoriteAlertsSubtitle,
		icon: "star-outline",
	},
	{
		key: "pickup_reminders_enabled",
		label: strings.notificationsSettings.pickupReminders,
		subtitle: strings.notificationsSettings.pickupRemindersSubtitle,
		icon: "time-outline",
	},
	{
		key: "last_minute_deals_enabled",
		label: strings.notificationsSettings.lastMinuteDeals,
		subtitle: strings.notificationsSettings.lastMinuteDealsSubtitle,
		icon: "flash-outline",
	},
	{
		key: "weekly_summary_enabled",
		label: strings.notificationsSettings.weeklySummary,
		subtitle: strings.notificationsSettings.weeklySummarySubtitle,
		icon: "stats-chart-outline",
	},
];

/**
 * Estado real del permiso, pidiéndolo solo si está en "default".
 * "denied" es pegajoso (el navegador/SO nunca vuelve a preguntar).
 */
async function ensurePushPermission(): Promise<"granted" | "denied"> {
	if (Platform.OS === "web") {
		if (typeof window === "undefined" || !("Notification" in window)) {
			return "denied";
		}
		if (Notification.permission === "default") {
			await Notification.requestPermission();
		}
		return Notification.permission === "granted" ? "granted" : "denied";
	}
	const current = await Notifications.getPermissionsAsync();
	if (current.status === "granted") return "granted";
	const requested = await Notifications.requestPermissionsAsync();
	return requested.status === "granted" ? "granted" : "denied";
}

function SectionTitle({ children }: { children: string }) {
	const { colors } = useTheme();
	return (
		<AppText
			variant="labelSmall"
			weight="bold"
			style={{ color: colors.mutedForeground }}
		>
			{children}
		</AppText>
	);
}

function NotificationRow({
	config,
	value,
	onToggle,
}: {
	config: ToggleConfig;
	value: boolean;
	onToggle: (config: ToggleConfig, value: boolean) => void;
}) {
	const { colors } = useTheme();
	const disabled = config.upcoming;

	return (
		<View style={[styles.toggleRow, disabled && styles.toggleRowDisabled]}>
			<View
				style={[styles.iconCircle, { backgroundColor: colors.inputBackground }]}
			>
				<Ionicons
					name={config.icon as never}
					size={18}
					color={disabled ? colors.mutedForeground : colors.foreground}
				/>
			</View>
			<View style={styles.toggleText}>
				<View style={styles.toggleTitleRow}>
					<AppText
						variant="bodyMedium"
						weight="bold"
						numberOfLines={1}
						style={[
							styles.toggleTitle,
							disabled && { color: colors.mutedForeground },
						]}
					>
						{config.label}
					</AppText>
					{config.upcoming ? (
						<View
							style={[
								styles.upcomingBadge,
								{ backgroundColor: colors.inputBackground },
							]}
						>
							<AppText
								style={{
									fontSize: 10,
									fontWeight: "600",
									color: colors.mutedForeground,
								}}
							>
								{strings.notificationsSettings.upcoming}
							</AppText>
						</View>
					) : null}
				</View>
				<AppText
					variant="bodySmall"
					numberOfLines={2}
					style={{ color: colors.mutedForeground, lineHeight: 16 }}
				>
					{config.subtitle}
				</AppText>
			</View>
			<Switch
				checked={Boolean(value)}
				disabled={disabled}
				onCheckedChange={(v) => onToggle(config, v)}
			/>
		</View>
	);
}

function ToggleCard({
	configs,
	prefs,
	onToggle,
}: {
	configs: ToggleConfig[];
	prefs: ConsumerNotificationPreferences | undefined;
	onToggle: (config: ToggleConfig, value: boolean) => void;
}) {
	const { colors } = useTheme();
	return (
		<Card style={styles.card}>
			{configs.map((config, index) => (
				<View key={config.key}>
					{index > 0 ? (
						<View style={[styles.divider, { backgroundColor: colors.border }]} />
					) : null}
					<NotificationRow
						config={config}
						value={Boolean(prefs?.[config.key])}
						onToggle={onToggle}
					/>
				</View>
			))}
		</Card>
	);
}

export default function NotificationsSettingsScreen() {
	const { colors } = useTheme();
	const { profile, status, initialized } = useAuthStore();
	const userId = profile?.id ?? "";
	const { data: prefs } = useNotificationPreferences(userId);
	const update = useUpdateNotificationPreferences(userId);

	// Redirect guests to login
	useEffect(() => {
		if (initialized && status === "guest") {
			router.replace("/login");
		}
	}, [status, initialized, router]);

	if (!initialized || status === "guest") return null;

	const toggle = async (config: ToggleConfig, value: boolean) => {
		if (config.upcoming) return;
		if (config.key === "push_enabled" && value) {
			const permission = await ensurePushPermission();
			if (permission === "denied") {
				// Permiso pegajoso: ni el navegador ni el SO volverán a
				// preguntar; guiamos al usuario a desbloquearlo manualmente.
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
				if (!registered) return; // Permiso denegado — sin toast.
				toast.success(strings.notificationsSettings.pushEnabled);
			} catch (e) {
				// 23505 = el token ya estaba registrado: igual de válido.
				const code = (e as { code?: string }).code;
				if (code !== "23505") {
					toast.error(
						e instanceof Error ? e.message : strings.common.error,
					);
					return;
				}
			}
		}
		update.mutate({
			[config.key]: value,
		} as Partial<ConsumerNotificationPreferences>);
	};

	return (
		<Screen scroll>
			<View style={styles.container}>
				<ScreenHeader title={strings.notificationsSettings.title} fallback="/(consumer)/profile" />

				<View
					style={[
						styles.banner,
						{
							backgroundColor: colors.primary + "0F",
							borderColor: colors.primary + "26",
						},
					]}
				>
					<Ionicons
						name="notifications-outline"
						size={22}
						color={colors.primary}
					/>
					<AppText
						variant="bodySmall"
						weight="medium"
						style={[styles.bannerText, { color: colors.primary }]}
					>
						{strings.notificationsSettings.banner}
					</AppText>
				</View>

				<SectionTitle>{strings.notificationsSettings.channelsSection}</SectionTitle>
				<ToggleCard configs={CHANNELS} prefs={prefs} onToggle={toggle} />

				<SectionTitle>{strings.notificationsSettings.smartSection}</SectionTitle>
				<ToggleCard configs={SMART_ALERTS} prefs={prefs} onToggle={toggle} />
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, gap: spacing.lg },
	banner: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.md,
		padding: spacing.lg,
		borderRadius: 20,
		borderWidth: 1,
	},
	bannerText: { flex: 1, lineHeight: 18 },
	card: { padding: 0, overflow: "hidden" },
	divider: { height: 1, marginLeft: spacing.xl },
	toggleRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: spacing.sm,
		paddingHorizontal: spacing.md,
		gap: spacing.md,
	},
	toggleRowDisabled: { opacity: 1 },
	iconCircle: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
	},
	toggleText: { flex: 1, gap: 2 },
	toggleTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	toggleTitle: { flexShrink: 1 },
	upcomingBadge: {
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 6,
	},
});