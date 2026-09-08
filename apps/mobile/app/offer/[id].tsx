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

import { ErrorState, LoadingView, useWebPullToRefresh } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import {
	useOffer,
	useIsFavorite,
	useToggleFavorite,
} from "@/features/hooks";
import {
	isOfferAvailable,
	isOfferOutOfStock,
} from "@/features/offers/domain/offer";
import { OfferHero } from "@/features/offers/components/detail/OfferHero";
import { OfferContent } from "@/features/offers/components/detail/OfferContent";
import { OfferBottomBar } from "@/features/offers/components/detail/OfferBottomBar";

const HERO_HEIGHT = 320;

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
	const scrollY = useRef(new Animated.Value(0)).current;
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
			<View
				style={[
					styles.centerBox,
					{ backgroundColor: colors.background, paddingTop: insets.top },
				]}
			>
				<LoadingView />
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
});
