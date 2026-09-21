import { useRef } from "react";
import { useLocalSearchParams } from "expo-router";
import {
	Animated,
	RefreshControl,
	ScrollView,
	StyleSheet,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorState, goBackOr, CircleIconButton, useWebPullToRefresh } from "@/src/core/ui";
import { ChevronLeft } from "lucide-react-native";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { strings } from "@/src/core/i18n/strings";
import {
	useOffer,
	useIsFavorite,
	useToggleFavorite,
} from "@/src/features/hooks";
import {
	isOfferAvailable,
	isOfferOutOfStock,
} from "@/src/features/offers/domain/offer";
import { OfferHero } from "@/src/features/offers/components/detail/OfferHero";
import { OfferContent } from "@/src/features/offers/components/detail/OfferContent";
import { OfferBottomBar } from "@/src/features/offers/components/detail/OfferBottomBar";

const HERO_HEIGHT = 320;
const BOTTOM_BAR_HEIGHT = 92;

export default function OfferDetailScreen() {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	const { id } = useLocalSearchParams<{ id: string }>();
	const offerId = id ?? "";
	const { data, isLoading, isError, error, refetch, isFetching } = useOffer(offerId);
	const isFavorite = useIsFavorite(offerId);
	const toggleFavorite = useToggleFavorite();

	const pull = useWebPullToRefresh({
		onRefresh: () => void refetch(),
		refreshing: !!isFetching,
	});
	const scrollYRef = useRef<Animated.Value | null>(null);
	if (scrollYRef.current === null) {
		scrollYRef.current = new Animated.Value(0);
	}
	const scrollY = scrollYRef.current;
	const headerHeight = scrollY.interpolate({
		inputRange: [0, HERO_HEIGHT],
		outputRange: [HERO_HEIGHT, 0],
		extrapolateRight: "clamp",
	});
	const headerOpacity = scrollY.interpolate({
		inputRange: [0, HERO_HEIGHT],
		outputRange: [1, 0],
		extrapolateRight: "clamp",
	});

	// Full-bleed hero: sin <Screen> para que la imagen ocupe el notch.
	if (isLoading) {
		return (
			<View style={[styles.flex, { backgroundColor: colors.background }]}>
				<ScrollView
					contentContainerStyle={{ paddingBottom: 140 }}
					showsVerticalScrollIndicator={false}
				>
					<Skeleton style={[styles.heroSkeleton, { height: HERO_HEIGHT }]} />
					<View style={styles.skeletonContent}>
						<Skeleton style={styles.skeletonTitle} />
						<Skeleton style={styles.skeletonSubtitle} />
						<Skeleton style={styles.skeletonSavingsBadge} />
						<View style={styles.skeletonPriceRow}>
							<Skeleton style={styles.skeletonPrice} />
							<Skeleton style={styles.skeletonOriginalPrice} />
							<Skeleton style={styles.skeletonSavePill} />
						</View>
						{/* Keep the always-present pickup and establishment structure. */}
						<Card style={styles.skeletonCard}>
							<CardHeader>
								<Skeleton style={styles.skeletonSectionTitle} />
							</CardHeader>
							<CardContent>
								{[0, 1, 2].map((row) => (
									<View key={row} style={styles.skeletonPickupRow}>
										<Skeleton style={styles.skeletonPickupIcon} />
										<View style={styles.skeletonDetails}>
											<Skeleton style={styles.skeletonLabel} />
											<Skeleton style={styles.skeletonValue} />
										</View>
									</View>
								))}
								<View style={styles.skeletonNote}>
									<Skeleton style={styles.skeletonNoteIcon} />
									<View style={styles.skeletonDetails}>
										<Skeleton style={styles.skeletonValue} />
										<Skeleton style={styles.skeletonLabel} />
									</View>
								</View>
							</CardContent>
						</Card>
						<Card style={styles.skeletonCard}>
							<CardHeader>
								<Skeleton style={styles.skeletonSectionTitle} />
							</CardHeader>
							<CardContent>
								<View style={styles.skeletonBusinessHead}>
									<Skeleton style={styles.skeletonLogo} />
									<View style={styles.skeletonDetails}>
										<Skeleton style={styles.skeletonValue} />
										<Skeleton style={styles.skeletonLabel} />
									</View>
								</View>
								<View style={styles.skeletonAddress}>
									<Skeleton style={styles.skeletonNoteIcon} />
									<Skeleton style={styles.skeletonValue} />
								</View>
							</CardContent>
						</Card>
					</View>
				</ScrollView>
				{/* Back remains available; data-dependent actions do not. */}
				<View style={[styles.skeletonTopBar, { top: insets.top + spacing.xl }]}>
					<CircleIconButton
						icon={
							<ChevronLeft
								size={20}
								color={colors.foreground}
							/>
						}
						onPress={() => goBackOr("/(consumer)")}
						accessibilityLabel={strings.common.back}
					/>
				</View>
				{/* Reserve the checkout footprint without exposing a purchase action. */}
				<Skeleton
					pointerEvents="none"
					style={[styles.skeletonBottomSpacer, { bottom: insets.bottom + 16 }]}
				/>
			</View>
		);
	}

	if (isError || !data) {
		return (
			<View
				style={[
					styles.centerBox,
					{ backgroundColor: colors.background, paddingTop: insets.top },
				]}
			>
				<ErrorState error={error} onRetry={() => void refetch()} />
			</View>
		);
	}

	const outOfStock = isOfferOutOfStock(data);
	const available = isOfferAvailable(data);

	return (
		<View style={[styles.flex, { backgroundColor: colors.background }]}>
			{pull.indicator}
			<ScrollView
				ref={pull.ref}
				style={styles.flex}
				contentContainerStyle={{ paddingBottom: 140 }}
				scrollEventThrottle={16}
				onScroll={Animated.event(
					[{ nativeEvent: { contentOffset: { y: scrollY } } }],
					{ useNativeDriver: false },
				)}
				showsVerticalScrollIndicator={false}
				refreshControl={<RefreshControl refreshing={!!isFetching} onRefresh={() => void refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
			>
				<View style={{ height: HERO_HEIGHT }} />

				<OfferContent data={data} />
			</ScrollView>

			<OfferHero
				image={data.offer.image}
				headerHeight={headerHeight}
				headerOpacity={headerOpacity}
				topOffset={insets.top + spacing.xl}
				isFavorite={isFavorite}
				onToggleFavorite={() => toggleFavorite.mutate(data.offer.id)}
			/>

			<OfferBottomBar
				detail={data}
				available={available}
				outOfStock={outOfStock}
				bottomOffset={insets.bottom + 16}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	centerBox: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.xl,
	},
	heroSkeleton: { width: "100%", borderRadius: 0 },
	skeletonContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, gap: spacing.md },
	skeletonTitle: { height: 26, width: "80%", borderRadius: radii.md },
	skeletonSubtitle: { height: 16, width: "50%", borderRadius: radii.md },
	skeletonSavingsBadge: { height: 28, width: 100, marginTop: spacing.xl, borderRadius: radii.pill },
	skeletonPriceRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.md },
	skeletonPrice: { height: 31, width: 110, borderRadius: radii.md },
	skeletonOriginalPrice: { height: 20, width: 64, borderRadius: radii.md },
	skeletonSavePill: { height: 24, width: 90, borderRadius: radii.pill },
	skeletonCard: { marginVertical: spacing.md },
	skeletonSectionTitle: { height: 21, width: "60%" },
	skeletonPickupRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: spacing.sm, gap: spacing.md },
	skeletonPickupIcon: { width: 31, height: 31, borderRadius: radii.md },
	skeletonDetails: { flex: 1, gap: spacing.xxs },
	skeletonLabel: { height: 16, width: "50%" },
	skeletonValue: { height: 20, width: "80%" },
	skeletonNote: { flexDirection: "row", gap: spacing.sm, padding: spacing.sm, marginTop: spacing.sm },
	skeletonNoteIcon: { width: 18, height: 18, borderRadius: radii.pill },
	skeletonBusinessHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
	skeletonLogo: { width: 48, height: 48, borderRadius: radii.md },
	skeletonAddress: { flexDirection: "row", gap: spacing.sm },
	skeletonTopBar: {
		position: "absolute",
		left: spacing.xl,
	},
	skeletonBottomSpacer: {
		position: "absolute",
		left: spacing.xl,
		right: spacing.xl,
		height: BOTTOM_BAR_HEIGHT,
		borderRadius: radii.lg,
	},
});
