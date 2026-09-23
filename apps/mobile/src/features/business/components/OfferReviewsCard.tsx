import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Star } from "lucide-react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { spacing } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import {
	useBusinessReviewCount,
	useBusinessReviews,
} from "@/src/features/business/hooks";
import { ReviewItem } from "./ReviewItem";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Reseñas de un producto (read-only): top 3 + ver todas filtradas.
 * Reutilizada en el detalle del producto y del pedido del negocio.
 */
export function OfferReviewsCard({
	businessId,
	offerId,
}: {
	businessId: string;
	offerId: string;
}) {
	const { colors } = useTheme();
	// Top-3 preview + total via server params (no full review fetch).
	const { data: infiniteData } = useBusinessReviews(businessId, {
		offerId,
		limit: 3,
	});
	const { data: totalCount } = useBusinessReviewCount(businessId, { offerId });
	const offerReviews = infiniteData?.pages[0] ?? [];
	if (offerReviews.length === 0) return null;
	const offerTitle = offerReviews[0]?.offerTitle ?? null;
	return (
		<Card style={styles.card}>
			<View style={styles.header}>
				<Star size={20} color={colors.primary} />
				<AppText variant="h4" weight="bold">
					{offerTitle ?? strings.business.reviews}
				</AppText>
			</View>
			{offerReviews.map((review) => (
				<ReviewItem key={review.id} review={review} />
			))}
			<Button
				variant="outline"
				fullWidth
				style={{ marginTop: spacing.sm }}
				onPress={() =>
					router.push({
						pathname: "/business/[id]/reviews",
						params: { id: businessId, offerId },
					})
				}
			>
				{strings.businessProfile.seeAllReviews.replace(
					"{n}",
					String(totalCount ?? offerReviews.length),
				)}
			</Button>
		</Card>
	);
}

const styles = StyleSheet.create({
	card: {
		padding: spacing.lg,
		gap: spacing.md,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
});
