import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Bell, CircleAlert, Mail, MessageCircle, MessageSquare, ShoppingBag, Smartphone, TrendingUp, type LucideIcon } from "lucide-react-native";

import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { strings } from "@/src/core/i18n/strings";
import {
	AppText,
	ErrorState,
	Screen,
	ScreenHeader,
} from "@/src/core/ui";
import {
	useBusinessNotifications,
	useUpdateBusinessNotifications,
} from "@/src/features/business/hooks";
import { useAuthStore } from "@/src/features/auth/store";
import { usePushToggle } from "@/src/features/notifications/use-push-toggle";
import type { BusinessNotificationPreferences } from "@0xc1x/role-commons";
import { spacing, radii } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import { Card } from "@/components/ui/card";

type ToggleKey = Exclude<
	keyof BusinessNotificationPreferences,
	"user_id" | "business_id" | "created_at" | "updated_at"
>;

interface ToggleConfig {
	key: ToggleKey;
	label: string;
	subtitle: string;
	icon: LucideIcon;
	upcoming?: boolean;
}

const EVENT_TYPES: ToggleConfig[] = [
	{
		key: "new_orders_enabled",
		label: strings.business.notificationsNewOrders,
		subtitle: strings.business.notificationsNewOrdersHint,
		icon: ShoppingBag,
	},
	{
		key: "pickup_ready_enabled",
		label: strings.business.notificationsPickupReady,
		subtitle: strings.business.notificationsPickupReadyHint,
		icon: Bell,
	},
	{
		key: "reviews_enabled",
		label: strings.business.notificationsReviews,
		subtitle: strings.business.notificationsReviewsHint,
		icon: MessageCircle,
	},
	{
		key: "low_stock_enabled",
		label: strings.business.notificationsLowStock,
		subtitle: strings.business.notificationsLowStockHint,
		icon: CircleAlert,
	},
	{
		key: "daily_summary_enabled",
		label: strings.business.notificationsDailySummary,
		subtitle: strings.business.notificationsDailySummaryHint,
		icon: TrendingUp,
	},
];

const CHANNELS: ToggleConfig[] = [
	{
		key: "push_enabled",
		label: strings.business.notificationsPush,
		subtitle: strings.business.notificationsPush ?? "",
		icon: Smartphone,
	},
	{
		key: "email_enabled",
		label: strings.business.notificationsEmail,
		subtitle: strings.business.notificationsEmail ?? "",
		icon: Mail,
	},
	{
		key: "sms_enabled",
		label: strings.business.notificationsSms,
		subtitle: strings.business.notificationsSms ?? "",
		icon: MessageSquare,
		upcoming: true,
	},
	{
		key: "whatsapp_enabled",
		label: strings.business.notificationsWhatsapp,
		subtitle: strings.business.notificationsWhatsapp ?? "",
		icon: MessageCircle,
		upcoming: true,
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
				{config.subtitle ? (
					<AppText
						variant="bodySmall"
						numberOfLines={2}
						style={{ color: colors.mutedForeground, lineHeight: 16 }}
					>
						{config.subtitle}
					</AppText>
				) : null}
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
	prefs: BusinessNotificationPreferences | undefined;
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

export default function BusinessNotificationsScreen() {
	const { colors } = useTheme();
	const { id } = useLocalSearchParams<{ id: string }>();
	const businessId = id ?? "";
	const { data: prefs, isLoading: prefsLoading, isError, error, refetch } =
		useBusinessNotifications(businessId);
	const update = useUpdateBusinessNotifications(businessId);
	const profile = useAuthStore((s) => s.profile);
	const userId = profile?.id ?? "";

	// Lock anti doble-tap y flujo de registro viven en el hook compartido.
	const { registering, enablePush } = usePushToggle(userId, async () => {
		await update.mutateAsync({
			push_enabled: true,
		} as Partial<BusinessNotificationPreferences>);
	});

	if (isError) {
		return <ErrorState error={error} onRetry={() => void refetch()} />;
	}

	const toggle = async (config: ToggleConfig, value: boolean) => {
		if (config.upcoming) return;
		if (config.key === "push_enabled" && value) {
			await enablePush();
			return;
		}
		update.mutate({
			[config.key]: value,
		} as Partial<BusinessNotificationPreferences>);
	};

	return (
		<Screen scroll>
			<View style={styles.container}>
				<ScreenHeader
					title={strings.business.notifications}
					fallback="/(business)/management"
				/>

				<Alert variant="info" icon={Bell}>
					<AlertDescription>
						<AppText
							variant="bodySmall"
							weight="medium"
							style={[styles.bannerText, { color: colors.infoForeground }]}
						>
							{strings.business.notificationsBannerBody}
						</AppText>
					</AlertDescription>
				</Alert>

				<SectionTitle>{strings.business.notificationsEventTypes}</SectionTitle>
				{prefsLoading ? (
					<Skeleton style={{ height: 310, borderRadius: radii.lg }} />
				) : (
					<ToggleCard
						configs={EVENT_TYPES}
						prefs={prefs}
						onToggle={toggle}
					/>
				)}

				<SectionTitle>{strings.business.notificationsChannels}</SectionTitle>
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
	toggleRowDisabled: { opacity: 1 },
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