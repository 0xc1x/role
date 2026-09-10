import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { withAlpha } from "@/core/theme/alpha";
import { BUSINESS_TYPE_LABELS } from "@/features/business/domain/business";
import type { BusinessProfileDetail } from "@/features/business/domain/business";

export function BusinessHeader({ profile }: { profile: BusinessProfileDetail }) {
	const { colors } = useTheme();
	const business = profile.business;
	return (
		<View>
			<View style={styles.headerRow}>
				<View style={[styles.logoBox, { backgroundColor: colors.background, boxShadow: `0px 8px 12px ${colors.shadow}` }]}>
					{business.image ? (
						<Image source={{ uri: business.image }} style={styles.logo} contentFit="cover" />
					) : (
						<View style={[styles.logo, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
							<Ionicons name="storefront-outline" size={28} color={colors.mutedForeground} />
						</View>
					)}
				</View>
				<View style={styles.headerText}>
					<View style={[styles.typeBadge, { backgroundColor: `${withAlpha(colors.primary, 0.102)}` }]}>
						<AppText
							style={{
								color: colors.primary,
								fontWeight: "700",
								letterSpacing: 0.8,
								fontSize: 11,
								textTransform: "uppercase",
							}}
						>
							{BUSINESS_TYPE_LABELS[business.type] ?? business.type}
						</AppText>
					</View>
					<AppText
						variant="h4"
						weight="extraBold"
						style={{ letterSpacing: -0.8, marginTop: 6 }}
					>
						{business.name}
					</AppText>
				</View>
			</View>

			<View style={[styles.ratingRow, { marginTop: spacing.md }]}>
				<Ionicons name="star" size={20} color={colors.yellow} />
				<AppText variant="bodyMedium" weight="bold">
					{(business.rating ?? 0).toFixed(1)}
				</AppText>
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
					{strings.businessProfile.communityReviews.replace(
						"{n}",
						String(business.review_count ?? 0),
					)}
				</AppText>
			</View>
		</View>
	);
}

export function StatsCard({ profile }: { profile: BusinessProfileDetail }) {
	const { colors } = useTheme();
	return (
		<View
			style={[
				styles.statsCard,
				{
					backgroundColor: colors.surfaceSuccess,
					borderColor: colors.surfaceSuccessBorder,
				},
			]}
		>
			<View style={styles.statsRow}>
				<Ionicons name="leaf-outline" size={24} color={colors.successDark} />
				<AppText
					// Display one-off: cifra de impacto del hero (fuera de escala).
					style={{
						fontSize: 32,
						fontWeight: "800",
						color: colors.successDark,
						marginLeft: spacing.sm,
					}}
				>
					{profile.totalRescued}
				</AppText>
			</View>
			<AppText
				weight="bold"
				style={{ color: colors.success, textAlign: "center", marginTop: spacing.xs }}
			>
				{strings.businessProfile.rescuedFromWaste}
			</AppText>
			{profile.memberSince ? (
				<AppText
					style={{
						color: `${withAlpha(colors.success, 0.702)}`,
						fontSize: 11,
						textAlign: "center",
						marginTop: spacing.sm,
					}}
				>
					{strings.businessProfile.partnerSince.replace(
						"{date}",
						profile.memberSince,
					)}
				</AppText>
			) : null}
		</View>
	);
}

export function AboutCard({ description }: { description: string }) {
	const { colors } = useTheme();
	return (
		<View style={[styles.card, { boxShadow: `0px 4px 12px ${colors.shadow}` }]}>
			<AppText variant="labelMedium" weight="bold">
				{strings.businessProfile.aboutBusiness}
			</AppText>
			<AppText
				style={{ color: colors.mutedForeground, lineHeight: 21, marginTop: spacing.sm }}
			>
				{description}
			</AppText>
		</View>
	);
}

const styles = StyleSheet.create({
	headerRow: {
		flexDirection: "row",
		alignItems: "flex-start",
	},
	logoBox: {
		width: 86,
		height: 86,
		borderRadius: radii.xl,
		padding: 4,
	},
	logo: {
		width: "100%",
		height: "100%",
		borderRadius: radii.xl,
	},
	headerText: {
		flex: 1,
		marginLeft: spacing.md,
		paddingTop: spacing.sm,
	},
	typeBadge: {
		alignSelf: "flex-start",
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 6,
	},
	ratingRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	statsCard: {
		width: "100%",
		padding: spacing.xl,
		borderRadius: radii.xl,
		borderWidth: 1,
		alignItems: "center",
	},
	statsRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
	},
	card: {
		width: "100%",
		padding: spacing.sm,
		borderRadius: radii.xl,
		backgroundColor: "transparent",
	},
});
