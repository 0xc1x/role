import { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useAuthStore } from "@/features/auth/store";
import { useProfileStats } from "@/features/profile/hooks";
import { strings } from "@/core/i18n/strings";
import { useTheme } from "@/core/theme";
import { AppText } from "@/core/ui";
import { spacing } from "@/core/theme/spacing";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

interface StatInfo {
	icon: IconName;
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
	const { data: stats } = useProfileStats(profile?.id ?? "");

	// Random stat index picked once per mount (Flutter Random().nextInt(3)).
	const statIndex = useMemo(() => Math.floor(Math.random() * 3), []);

	if (!profile) return null;

	const secondaryAlpha = colors.secondary + "1A";

	const firstName = getDisplayName(profile);

	const stat: StatInfo = (() => {
		switch (statIndex) {
			case 0: {
				const totalSaved = (stats?.total_saved_cents ?? 0) / 100;
				const value =
					totalSaved >= 1000
						? `$${totalSaved.toFixed(1).replace(".0", "")}k`
						: `$${totalSaved.toFixed(0)}`;
				return { icon: "trophy-outline", value, label: strings.home.statSaved };
			}
			case 1:
				return {
					icon: "cube-outline",
					value: String(stats?.total_orders ?? 0),
					label: strings.home.statOrders,
				};
			default:
				return {
					icon: "leaf-outline",
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
				<View style={[styles.statIcon, { backgroundColor: secondaryAlpha }]}>
					<Ionicons name={stat.icon} size={16} color={colors.secondary} />
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
		borderRadius: 50,
		alignItems: "center",
		justifyContent: "center",
	},
	statIcon: {
		width: 28,
		height: 28,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 2,
	},
});
