import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { strings } from "@/core/i18n/strings";
import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import { formatCount, formatMoney } from "@/core/utils/formatters";
import type { UserProfile } from "@/features/auth/domain/user";
import { useProfileStats } from "@/features/profile/hooks";

export function initialsOf(profile: UserProfile): string {
	const name = profile.fullName?.trim();
	if (!name) return "F";
	const parts = name.split(/\s+/);
	if (parts.length >= 2) {
		return `${parts[0]?.[0] ?? "F"}${parts[1]?.[0] ?? ""}`.toUpperCase();
	}
	return (parts[0]?.[0] ?? "F").toUpperCase();
}

export function ProfileAvatar({ profile }: { profile: UserProfile }) {
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

export function ProfileHeader({ profile }: { profile: UserProfile }) {
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

const styles = StyleSheet.create({
	headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
	statsRow: { flexDirection: "row", gap: spacing.sm },
	statCard: {
		flex: 1,
		gap: 2,
		padding: spacing.md,
		borderRadius: 16,
		alignItems: "center",
	},
});
