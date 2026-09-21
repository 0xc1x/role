import { Store, User, UtensilsCrossed } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { radii, spacing } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import type { BusinessReviewView } from "@/src/features/business/domain/business";

export function ReviewItem({ review }: { review: BusinessReviewView }) {
	const { colors } = useTheme();
	const date = new Date(review.date);
	const dateLabel = Number.isNaN(date.getTime())
		? ""
		: `${date.getDate()}/${date.getMonth() + 1}`;
	return (
		<View style={[styles.reviewItem, { borderBottomColor: colors.border }]}>
			<View style={[styles.avatar, { backgroundColor: colors.muted }]}>
				<User size={16} color={colors.mutedForeground} />
			</View>
			<View style={{ width: spacing.sm }} />
			<View style={{ flex: 1 }}>
				<View style={styles.reviewHeaderRow}>
					<AppText variant="labelSmall" weight="bold">
						{review.userName}
					</AppText>
					<AppText style={{ color: colors.mutedForeground, fontSize: 12 }}>
						{dateLabel}
					</AppText>
				</View>
				<View style={styles.reviewRatingRow}>
					<UtensilsCrossed size={12} color={colors.yellow} />
					<AppText style={{ fontSize: 12 }}>
						{strings.businessProfile.packRating.replace("{n}", String(review.productRating))}
					</AppText>
					<View style={{ width: spacing.md }} />
					<Store size={12} color={colors.yellow} />
					<AppText style={{ fontSize: 12 }}>
						{strings.businessProfile.attentionRating.replace("{n}", String(review.businessRating))}
					</AppText>
				</View>
				{review.comment ? (
					<AppText style={{ color: colors.mutedForeground, lineHeight: 19, marginTop: 6 }}>
						{review.comment}
					</AppText>
				) : null}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	reviewItem: {
		flexDirection: "row",
		alignItems: "flex-start",
		paddingVertical: spacing.md,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	avatar: {
		width: 36,
		height: 36,
		borderRadius: radii.md,
		alignItems: "center",
		justifyContent: "center",
	},
	reviewHeaderRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	reviewRatingRow: {
		flexDirection: "row",
		alignItems: "center",
		marginTop: 2,
		gap: 4,
	},
});
