import { Store, User, UtensilsCrossed } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { radii, spacing } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import { authorDisc } from "@/src/core/utils/author-palette";
import type { BusinessReviewView } from "@/src/features/business/domain/business";

export function ReviewItem({ review }: { review: BusinessReviewView }) {
	const { colors, scheme } = useTheme();
	// El color ES la identidad del autor: `profiles` no tiene policy que deje
	// leer el perfil de otro consumidor, así que `userName` cae a "Cliente"
	// para casi todos y el nombre no distingue a nadie.
	const disc = authorDisc(scheme, review.authorId);
	const date = new Date(review.date);
	const dateLabel = Number.isNaN(date.getTime())
		? ""
		: `${date.getDate()}/${date.getMonth() + 1}`;
	return (
		<View style={[styles.reviewItem, { borderBottomColor: colors.border }]}>
			<View style={[styles.avatar, { backgroundColor: disc.fill }]}>
				<User size={16} color={disc.on} />
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
						{strings.businessProfile.packRating.replace(
							"{n}",
							String(review.productRating),
						)}
					</AppText>
					<View style={{ width: spacing.md }} />
					<Store size={12} color={colors.yellow} />
					<AppText style={{ fontSize: 12 }}>
						{strings.businessProfile.attentionRating.replace(
							"{n}",
							String(review.businessRating),
						)}
					</AppText>
				</View>
				{review.comment ? (
					<AppText
						style={{
							color: colors.mutedForeground,
							lineHeight: 19,
							marginTop: 6,
						}}
					>
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
