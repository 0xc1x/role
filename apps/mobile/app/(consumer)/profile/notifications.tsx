import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Bell, ChartColumn, Clock, Mail, MessageCircle, MessageSquare, Smartphone, Star, Zap, type LucideIcon } from "lucide-react-native";

import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { strings } from "@/src/core/i18n/strings";
import { AppText, Screen, ScreenHeader } from "@/src/core/ui";
import { useAuthStore } from "@/src/features/auth/store";
import { removeDeviceToken } from "@/src/features/notifications";
import {
	useNotificationPreferences,
	useUpdateNotificationPreferences,
} from "@/src/features/profile/hooks";
import { usePushToggle } from "@/src/features/notifications/use-push-toggle";
import type { ConsumerNotificationPreferences } from "@0xc1x/role-commons";
import { spacing, radii } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import { Card } from "@/components/ui/card";

type ToggleKey = Exclude<
	keyof ConsumerNotificationPreferences,
	"user_id" | "created_at" | "updated_at"
>;

interface ToggleConfig {
	key: ToggleKey;
	label: string;
	subtitle: string;
	icon: LucideIcon;
	upcoming?: boolean;
}

const CHANNELS: ToggleConfig[] = [
	{
		key: "push_enabled",
		label: strings.notificationsSettings.push,
		subtitle: strings.notificationsSettings.pushSubtitle,
		icon: Smartphone,
	},
	{
		key: "email_enabled",
		label: strings.notificationsSettings.email,
		subtitle: strings.notificationsSettings.emailSubtitle,
		icon: Mail,
	},
	{
		key: "sms_enabled",
		label: strings.notificationsSettings.sms,
		subtitle: strings.notificationsSettings.smsSubtitle,
		icon: MessageSquare,
		upcoming: true,
	},
	{
		key: "whatsapp_enabled",
		label: strings.notificationsSettings.whatsapp,
		subtitle: strings.notificationsSettings.whatsappSubtitle,
		icon: MessageCircle,
		upcoming: true,
	},
];

const SMART_ALERTS: ToggleConfig[] = [
	{
		key: "favorite_alerts_enabled",
		label: strings.notificationsSettings.favoriteAlerts,
		subtitle: strings.notificationsSettings.favoriteAlertsSubtitle,
		icon: Star,
	},
	{
		key: "pickup_reminders_enabled",
		label: strings.notificationsSettings.pickupReminders,
		subtitle: strings.notificationsSettings.pickupRemindersSubtitle,
		icon: Clock,
	},
	{
		key: "last_minute_deals_enabled",
		label: strings.notificationsSettings.lastMinuteDeals,
		subtitle: strings.notificationsSettings.lastMinuteDealsSubtitle,
		icon: Zap,
	},
	{
		key: "weekly_summary_enabled",
		label: strings.notificationsSettings.weeklySummary,
		subtitle: strings.notificationsSettings.weeklySummarySubtitle,
		icon: ChartColumn,
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
	const Icon = config.icon;

	return (
		<View style={[styles.toggleRow, disabled && styles.toggleRowDisabled]}>
			<View
				style={[styles.iconCircle, { backgroundColor: colors.inputBackground }]}
			>
				<Icon
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
	const { data: prefs, isLoading: prefsLoading } = useNotificationPreferences(userId);
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
	}, [status, initialized]);

	if (!initialized || status === "guest") return null;

	const toggle = async (config: ToggleConfig, value: boolean) => {
		if (config.upcoming) return;
		if (config.key === "push_enabled" && value) {
			await enablePush();
			return;
		}
		if (config.key === "push_enabled" && !value) {
			// Push off: drop this device's token so it stops receiving pushes,
			// then persist the preference.
			await removeDeviceToken(userId).catch(() => {});
		}
		update.mutate({
			[config.key]: value,
		} as Partial<ConsumerNotificationPreferences>);
	};

	return (
		<Screen scroll>
			<View style={styles.container}>
				<ScreenHeader title={strings.notificationsSettings.title} fallback="/(consumer)/profile" />

				<Alert variant="info" icon={Bell}>
					<AlertDescription>
						<AppText
							variant="bodySmall"
							weight="medium"
							style={[styles.bannerText, { color: colors.infoForeground }]}
						>
							{strings.notificationsSettings.banner}
						</AppText>
					</AlertDescription>
				</Alert>

				<SectionTitle>{strings.notificationsSettings.channelsSection}</SectionTitle>
				{prefsLoading ? (
					<Skeleton style={{ height: 248, borderRadius: radii.lg }} />
				) : (
					<ToggleCard
						configs={CHANNELS}
						prefs={prefs}
						onToggle={toggle}
						registering={registering}
					/>
				)}

				<SectionTitle>{strings.notificationsSettings.smartSection}</SectionTitle>
				{prefsLoading ? (
					<Skeleton style={{ height: 248, borderRadius: radii.lg }} />
				) : (
					<ToggleCard configs={SMART_ALERTS} prefs={prefs} onToggle={toggle} />
				)}
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, gap: spacing.lg },
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
	toggleRowDisabled: { opacity: 0.55 },
	iconCircle: {
		width: 36,
		height: 36,
		borderRadius: radii.lg,
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
		borderRadius: radii.sm,
	},
});