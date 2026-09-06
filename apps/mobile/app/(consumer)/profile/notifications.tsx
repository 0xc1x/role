import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Switch } from "@/components/ui/switch";
import { strings } from "@/core/i18n/strings";
import { AppText, Card, Screen, ScreenHeader } from "@/core/ui";
import { useAuthStore } from "@/features/auth/store";
import {
	useNotificationPreferences,
	useUpdateNotificationPreferences,
} from "@/features/profile/hooks";
import { usePushToggle } from "@/features/notifications/use-push-toggle";import type { ConsumerNotificationPreferences } from "@0xc1x/role-commons";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import { withAlpha } from "@/core/theme/alpha";

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
	registering,
}: {
	config: ToggleConfig;
	value: boolean;
	onToggle: (config: ToggleConfig, value: boolean) => void;
	registering?: boolean;
}) {
	const { colors } = useTheme();
	const disabled =
		config.upcoming || (config.key === "push_enabled" && Boolean(registering));

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
	registering,
}: {
	configs: ToggleConfig[];
	prefs: ConsumerNotificationPreferences | undefined;
	onToggle: (config: ToggleConfig, value: boolean) => void;
	registering?: boolean;
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
						registering={registering}
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
	// Lock anti doble-tap y flujo de registro viven en el hook compartido.
	const { registering, enablePush } = usePushToggle(userId, async () => {
		await update.mutateAsync({
			push_enabled: true,
		} as Partial<ConsumerNotificationPreferences>);
	});
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
			await enablePush();
			return;
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
							backgroundColor: withAlpha(colors.primary, 0.059),
							borderColor: withAlpha(colors.primary, 0.149),
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
				<ToggleCard
					configs={CHANNELS}
					prefs={prefs}
					onToggle={toggle}
					registering={registering}
				/>

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