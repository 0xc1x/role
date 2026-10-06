import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { Star } from "lucide-react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import type { BusinessProfileDetail } from "@/src/features/business/domain/business";
import { ReviewItem } from "@/src/features/business/components/ReviewItem";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";

/**
 * Reseñas, contraíbles.
 *
 * El header lleva la puntuación Y la cantidad, que antes solo vivían en el
 * link del pie: con las reseñas contraídas, el link del pie queda dentro del
 * cuerpo y entonces el "¿cuán bien lo rated este local?" no se respondía sin
 * abrirla. El promedio y el total son la señal que hace decidir si abrirla.
 *
 * Arranca contraída por lo mismo que los horarios, y es la decisión de la que
 * más se beneficia la sección de ofertas que va justo abajo: se ven las
 * reseñas y se leen si hay algo que leer.
 */
export function ReviewsCard({ profile }: { profile: BusinessProfileDetail }) {
	const { colors } = useTheme();
	const business = profile.business;
	const reviewCount = business.review_count ?? 0;
	return (
		<Card style={[styles.card, { boxShadow: `0px 4px 12px ${colors.shadow}` }]}>
			<Accordion type="single" collapsible>
				<AccordionItem value="business-reviews" className="border-b-0">
					<CardHeader>
						<AccordionTrigger
							className="py-0"
							accessibilityLabel={strings.businessProfile.reviewsTitle}
						>
							<View style={styles.reviewsHeaderRow}>
								<AppText variant="labelMedium" weight="bold">
									{strings.businessProfile.reviewsTitle}
								</AppText>
								<View style={styles.ratingGroup}>
									<View
										style={[
											styles.ratingBadge,
											{ backgroundColor: colors.surfaceWarning },
										]}
									>
										<Star size={14} color={colors.yellowDark} />
										<View style={{ width: 4 }} />
										<AppText weight="bold" style={{ color: colors.yellowDark }}>
											{(business.rating ?? 0).toFixed(1)}
										</AppText>
									</View>
									{/* El total va acá y no solo en el link del cuerpo: contraído,
									    el link no se ve y el número sí dice si vale la pena abrir. */}
									{reviewCount > 0 ? (
										<AppText
											variant="labelSmall"
											style={{ color: colors.mutedForeground }}
										>
											{`(${reviewCount})`}
										</AppText>
									) : null}
								</View>
							</View>
						</AccordionTrigger>
					</CardHeader>
					<AccordionContent className="p-0">
						<CardContent>
							{profile.reviews.length === 0 ? (
								<View>
									<AppText
										style={{
											color: colors.mutedForeground,
											textAlign: "center",
										}}
									>
										{strings.businessProfile.noReviews}
									</AppText>
								</View>
							) : (
								profile.reviews.map((review) => (
									<ReviewItem key={review.id} review={review} />
								))
							)}

							{reviewCount > 0 ? (
								<Pressable
									onPress={() =>
										router.push(`/business-profile/${business.id}/reviews`)
									}
									hitSlop={8}
									accessibilityRole="link"
								>
									<AppText
										weight="bold"
										style={{
											color: colors.primary,
											textAlign: "center",
											marginTop: spacing.sm,
										}}
									>
										{strings.businessProfile.seeAllReviews.replace(
											"{n}",
											String(reviewCount),
										)}
									</AppText>
								</Pressable>
							) : null}
						</CardContent>
					</AccordionContent>
				</AccordionItem>
			</Accordion>
		</Card>
	);
}

const styles = StyleSheet.create({
	card: {
		width: "100%",
		padding: spacing.sm,
		borderRadius: radii.xl,
		backgroundColor: "transparent",
	},
	reviewsHeaderRow: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	ratingGroup: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	ratingBadge: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
		borderRadius: radii.xs,
	},
});
