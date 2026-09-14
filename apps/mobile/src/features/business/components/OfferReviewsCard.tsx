import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import { AppText, Button, Card } from "@/core/ui";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import { useBusinessReviews } from "@/features/business/hooks";
import { ReviewItem } from "./ReviewItem";

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
	const { data: reviews } = useBusinessReviews(businessId);
	const offerReviews = (reviews ?? []).filter((r) => r.offerId === offerId);
	if (offerReviews.length === 0) return null;
	const offerTitle = offerReviews[0]?.offerTitle ?? null;
	return (
		<Card style={styles.card}>
			<View style={styles.header}>
				<Ionicons name="star-outline" size={20} color={colors.primary} />
				<AppText variant="h4" weight="bold">
					{offerTitle ?? strings.business.reviews}
				</AppText>
			</View>
			{offerReviews.slice(0, 3).map((review) => (
				<ReviewItem key={review.id} review={review} />
			))}
			<Button
				label={strings.businessProfile.seeAllReviews.replace(
					"{n}",
					String(offerReviews.length),
				)}
				variant="outline"
				fullWidth
				style={{ marginTop: spacing.sm }}
				onPress={() =>
					router.push({
						pathname: "/business/[id]/reviews",
						params: { id: businessId, offerId },
					})
				}
			/>
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
