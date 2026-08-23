import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link, router, type Href } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	Button,
	Card,
	EmptyState,
	ErrorState,
	LoadingView,
	Screen,
} from "@/core/ui";
import { useAuthStore } from "@/features/auth/store";
import { authRepository } from "@/features/auth/data/repository";
import { useProfileStats } from "@/features/profile/hooks";
import { useOrders } from "@/features/hooks";
import { OrderCard } from "@/features/orders/components/OrderCard";
import {
	isActiveStatus,
	isTerminalStatus,
} from "@/features/orders/domain/order";
import { formatCount, formatMoney } from "@/core/utils/formatters";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import type { UserProfile } from "@/features/auth/domain/user";
import { Text } from "@/components/ui/text";

type IoniconName = keyof typeof Ionicons.glyphMap;
type ProfileTab = "history" | "settings";

function initialsOf(profile: UserProfile): string {
	const name = profile.fullName?.trim();
	if (!name) return "F";
	const parts = name.split(/\s+/);
	if (parts.length >= 2) {
		return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
	}
	return parts[0][0]!.toUpperCase();
}

function ProfileAvatar({ profile }: { profile: UserProfile }) {
	const { colors } = useTheme();
	return (
		<Avatar style={{ width: 80, height: 80 }} alt={initialsOf(profile)}>
			{profile.avatarUrl ? (
				<AvatarImage source={{ uri: profile.avatarUrl }} />
			) : null}
			<AvatarFallback className="bg-primary">
				<AppText
					style={{ fontSize: 28, fontWeight: "700", color: colors.primaryForeground }}
				>
					{initialsOf(profile)}
				</AppText>
			</AvatarFallback>
		</Avatar>
	);
}

function StatCard({ value, label }: { value: string; label: string }) {
	const { colors } = useTheme();
	return (
		<View style={[styles.statCard, { backgroundColor: colors.card }]}>
			<AppText variant="h4" weight="bold" style={{ color: colors.primary }}>
				{value}
			</AppText>
			<AppText
				variant="bodySmall"
				numberOfLines={1}
				style={{ color: colors.mutedForeground }}
			>
				{label}
			</AppText>
		</View>
	);
}

function ProfileHeader({ profile }: { profile: UserProfile }) {
	const { colors } = useTheme();
	const { data: stats } = useProfileStats(profile.id);

	return (
		<View style={{ gap: spacing.lg }}>
			<View style={styles.headerRow}>
				<ProfileAvatar profile={profile} />
				<View style={{ flex: 1, gap: 2 }}>
					<AppText variant="h3" weight="bold">
						{profile.fullName ?? profile.email}
					</AppText>
					<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
						{profile.email}
					</AppText>
				</View>
			</View>

			<View style={styles.statsRow}>
				<StatCard
					value={formatMoney(Math.round((stats?.total_saved_cents ?? 0) / 100))}
					label={strings.profile.totalSaved}
				/>
				<StatCard
					value={formatCount(stats?.total_orders ?? 0)}
					label={strings.profile.totalOrders}
				/>
				<StatCard
					value={`${(stats?.co2_saved_kg ?? 0).toFixed(1)} kg`}
					label={strings.profile.co2Saved}
				/>
			</View>
		</View>
	);
}

// ─── Tabs ───────────────────────────────────────────────────────────

function ProfileTabs({
	active,
	onChange,
}: {
	active: ProfileTab;
	onChange: (tab: ProfileTab) => void;
}) {
	const { colors } = useTheme();
	const tabs: Array<{ key: ProfileTab; label: string }> = [
		{ key: "history", label: strings.profile.historyTab },
		{ key: "settings", label: strings.profile.settingsTab },
	];
	return (
		<View style={styles.tabBar}>
			{tabs.map((tab) => {
				const selected = active === tab.key;
				return (
					<Pressable
						key={tab.key}
						onPress={() => onChange(tab.key)}
						style={[
							styles.tab,
							selected && { borderBottomColor: colors.primary },
						]}
					>
						<AppText
							variant="bodyMedium"
							weight={selected ? "bold" : "regular"}
							style={{ color: selected ? colors.primary : colors.mutedForeground }}
						>
							{tab.label}
						</AppText>
					</Pressable>
				);
			})}
		</View>
	);
}

// ─── Historial tab ──────────────────────────────────────────────────

function HistoryTab() {
	const { colors } = useTheme();
	const { data, isLoading, isError, error, refetch } = useOrders();

	if (isLoading) return <LoadingView />;
	if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
	if (!data || data.length === 0) {
		return (
			<EmptyState title={strings.orders.empty} message={strings.orders.emptyHint} />
		);
	}

	const upcoming = data.filter((order) => isActiveStatus(order.order.status));
	const past = data.filter((order) => isTerminalStatus(order.order.status));

	return (
		<View style={{ gap: spacing.lg }}>
			{upcoming.length > 0 ? (
				<>
					<AppText variant="h3" weight="bold">
						{strings.profile.upcomingOrders}
					</AppText>
					{upcoming.map((order) => (
						<OrderCard key={order.order.id} item={order} />
					))}
				</>
			) : null}

			{past.length > 0 ? (
				<>
					<View style={styles.pastHeader}>
						<AppText variant="h3" weight="bold" style={styles.pastTitle}>
							{strings.profile.pastOrders}
						</AppText>
						<Link
							href="/profile/orders"
							style={[styles.viewAll, { color: colors.primary }]}
						>
							{past.length > 5
								? strings.profile.viewAllCount.replace("{n}", String(past.length))
								: strings.profile.viewAll}
						</Link>
					</View>
					{past.slice(0, 5).map((order) => (
						<OrderCard key={order.order.id} item={order} />
					))}
				</>
			) : null}
		</View>
	);
}

// ─── Configuración tab ──────────────────────────────────────────────

interface SettingsItem {
	icon: IoniconName;
	label: string;
	href: Href;
}

interface SettingsGroup {
	title: string;
	items: SettingsItem[];
}

const SETTINGS_GROUPS: SettingsGroup[] = [
	{
		title: strings.profile.sectionAccount,
		items: [
			{ icon: "person-outline", label: strings.profile.editProfile, href: "/profile/edit" },
			{ icon: "card-outline", label: strings.profile.paymentMethods, href: "/profile/payment-methods" },
			{ icon: "location-outline", label: strings.profile.savedAddresses, href: "/profile/addresses" },
		],
	},
	{
		title: strings.profile.sectionPreferences,
		items: [
			{ icon: "notifications-outline", label: strings.profile.notifications, href: "/profile/notifications" },
			{ icon: "heart-outline", label: strings.favorites.title, href: "/profile/favorites" },
			{ icon: "settings-outline", label: strings.profile.settings, href: "/profile/settings" },
		],
	},
	{
		title: strings.profile.sectionHelp,
		items: [{ icon: "help-circle-outline", label: strings.profile.help, href: "/profile/help" }],
	},
];

function IconRow({ icon, label, href }: SettingsItem) {
	const { colors } = useTheme();
	return (
		<Link href={href} asChild>
			<View style={styles.iconRow}>
				<Ionicons name={icon} size={18} color={colors.mutedForeground} />
				<AppText variant="bodyMedium" style={{ flex: 1 }}>
					{label}
				</AppText>
				<Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
			</View>
		</Link>
	);
}

function SettingsTab() {
	const { colors } = useTheme();
	return (
		<View style={{ gap: spacing.lg }}>
			{SETTINGS_GROUPS.map((group) => (
				<View key={group.title} style={{ gap: spacing.sm }}>
					<AppText
						variant="labelSmall"
						weight="bold"
						style={{ color: colors.mutedForeground }}
					>
						{group.title}
					</AppText>
					<Card style={styles.menuCard}>
						{group.items.map((item) => (
							<IconRow key={item.label} icon={item.icon} label={item.label} href={item.href} />
						))}
					</Card>
				</View>
			))}
			<SignOutDialog />
		</View>
	);
}

function SignOutDialog() {
	const [open, setOpen] = useState(false);

	const confirmSignOut = () => {
		authRepository.signOut().then(() => {
			useAuthStore.getState().clear();
		});
		setOpen(false);
	};

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<AlertDialogTrigger asChild>
				<Button
					label={strings.profile.signOutItem}
					variant="danger"
					onPress={() => setOpen(true)}
				/>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{strings.auth.signOut}</AlertDialogTitle>
					<AlertDialogDescription>{strings.auth.signOutConfirm}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>
						<Text>Cancelar</Text>
					</AlertDialogCancel>
					<AlertDialogAction onPress={confirmSignOut}>
						<Text>{strings.auth.signOut}</Text>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export default function ProfileScreen() {
	const { status, initialized, profile } = useAuthStore();
	const [activeTab, setActiveTab] = useState<ProfileTab>("history");

	// Redirect guests to login
	useEffect(() => {
		if (initialized && status === "guest") {
			router.replace("/login");
		}
	}, [status, initialized, router]);

	if (!initialized || status === "guest") return null;

	return (
		<Screen scroll>
			<View style={styles.container}>
				<AppText variant="h2" weight="bold">
					{strings.profile.title}
				</AppText>

				{status === "authenticated" && profile ? (
					<ProfileHeader profile={profile} />
				) : null}

				<ProfileTabs active={activeTab} onChange={setActiveTab} />

				{activeTab === "history" ? <HistoryTab /> : <SettingsTab />}
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, gap: spacing.lg },
	headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
	statsRow: { flexDirection: "row", gap: spacing.sm },
	statCard: {
		flex: 1,
		gap: 2,
		padding: spacing.md,
		borderRadius: 16,
		alignItems: "center",
	},
	tabBar: { flexDirection: "row" },
	tab: {
		flex: 1,
		alignItems: "center",
		paddingVertical: spacing.md,
		borderBottomWidth: 2,
		borderBottomColor: "transparent",
	},
	pastHeader: { flexDirection: "row", alignItems: "center" },
	pastTitle: { flex: 1 },
	viewAll: { fontWeight: "600" },
	menuCard: { padding: 0, overflow: "hidden" },
	iconRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.md,
	},
});