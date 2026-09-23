import { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { Leaf, Package, Trophy, type LucideIcon } from "lucide-react-native";

import { useAuthStore } from "@/src/features/auth/store";
import { useProfileStats } from "@/src/features/profile/hooks";
import { strings } from "@/src/core/i18n/strings";
import { useTheme } from "@/src/core/theme";
import { AppText } from "@/src/core/ui";
import { radii, spacing } from "@/src/core/theme/spacing";
import { withAlpha } from "@/src/core/theme/alpha";
import { formatMoney } from "@/src/core/utils/formatters";
import { Skeleton } from "@/components/ui/skeleton";

interface StatInfo {
	icon: LucideIcon;
	value: string;
	label: string;
}

function getGreeting(): string {
	const hour = new Date().getHours();
	if (hour >= 6 && hour < 12) return strings.home.greetingMorning;
	if (hour >= 12 && hour < 19) return strings.home.greetingAfternoon;
	return strings.home.greetingNight;
}

function getContextualMessage(): string {
	const now = new Date();
	const hour = now.getHours();
	const weekday = now.getDay();
	const isWeekend = weekday === 0 || weekday === 6;
	if (hour >= 6 && hour < 12) {
		return isWeekend ? strings.home.welcomeMorningWeekend : strings.home.welcomeMorning;
	}
	if (hour >= 12 && hour < 19) {
		if (weekday === 5) return strings.home.welcomeAfternoonFriday;
		if (isWeekend) return strings.home.welcomeAfternoonWeekend;
		return strings.home.welcomeAfternoon;
	}
	return strings.home.welcomeNight;
}

function getDisplayName(profile: {
	fullName?: string | null;
	email?: string | null;
}): string {
	if (profile.fullName && profile.fullName.length > 0) {
		return profile.fullName.trim().split(" ")[0];
	}
	if (profile.email && profile.email.length > 0) {
		return profile.email.split("@")[0];
	}
	return strings.home.fallbackName;
}

export function WelcomeBanner() {
	const { colors } = useTheme();
	const profile = useAuthStore((s) => s.profile);
	const { data: stats, isLoading: statsLoading } = useProfileStats(
		profile?.id ?? "",
	);

	// Random stat index picked once per mount (Flutter Random().nextInt(3)).
	const statIndex = useMemo(() => Math.floor(Math.random() * 3), []);

	if (!profile) return null;

	const secondaryAlpha = withAlpha(colors.secondary, 0.102);

	const firstName = getDisplayName(profile);

	const stat: StatInfo | null = statsLoading
		? null
		: (() => {
				switch (statIndex) {
					case 0: {
						const totalSaved = (stats?.total_saved_cents ?? 0) / 100;
						return {
							icon: Trophy,
							value: formatMoney(totalSaved),
							label: strings.home.statSaved,
						};
					}
					case 1:
						return {
							icon: Package,
							value: String(stats?.total_orders ?? 0),
							label: strings.home.statOrders,
						};
					default:
						return {
							icon: Leaf,
							value: `${(stats?.co2_saved_kg ?? 0).toFixed(1)} kg`,
							label: strings.home.statCo2,
						};
				}
			})();

	return (
		<View style={styles.container}>
			<View style={styles.content}>
				<AppText variant="h2" weight="bold">
					{getGreeting()}
				</AppText>
				<AppText
					variant="h1"
					weight="extraBold"
					style={{ color: colors.secondary }}
				>
					{firstName || strings.home.welcome}
				</AppText>
			<AppText
				variant="bodySmall"
				style={{ color: colors.mutedForeground }}
			>
				{getContextualMessage()}
			</AppText>
			</View>
			<View style={[styles.statCircle, { backgroundColor: secondaryAlpha }]}>
				{stat == null ? (
					<Skeleton
						style={{ width: 72, height: 72, borderRadius: radii.xxxl }}
					/>
				) : (
					<>
						<View style={[styles.statIcon, { backgroundColor: secondaryAlpha }]}>
							<stat.icon size={16} color={colors.secondary} />
						</View>
						<AppText
							variant="h2"
							weight="extraBold"
							style={{ color: colors.accent, fontSize: 22, lineHeight: 26 }}
						>
							{stat.value}
						</AppText>
						<AppText variant="bodySmall" style={{ color: colors.secondary }}>
							{stat.label}
						</AppText>
					</>
				)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginHorizontal: spacing.lg,
		marginTop: spacing.md,
		marginBottom: spacing.sm,
		height: 100,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	content: {
		flex: 3,
		justifyContent: "center",
	},
	statCircle: {
		width: 100,
		height: 100,
		borderRadius: radii.xxxl,
		alignItems: "center",
		justifyContent: "center",
	},
	statIcon: {
		width: 28,
		height: 28,
		borderRadius: radii.md,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 2,
	},
});
