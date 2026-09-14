import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Skeleton } from "@/components/ui/skeleton";
import { strings } from "@/core/i18n/strings";
import { spacing, radii } from "@/core/theme/spacing";
import { ErrorState, Screen, ScreenHeader } from "@/core/ui";
import { ProductDetail } from "@/features/business/components/products/ProductDetail";
import { useOffer } from "@/features/hooks";

export default function OfferDetailScreen() {
	const { id, offerId } = useLocalSearchParams<{ id: string; offerId: string }>();
	const businessId = id ?? "";

	const { data: product, isLoading, isError, error, refetch, isFetching } = useOffer(offerId ?? "");

	if (isLoading) return <OfferDetailSkeleton />;
	if (isError || !product)
		return <ErrorState error={error} onRetry={() => void refetch()} />;

	return (
		<ProductDetail
			businessId={businessId}
			product={product}
			isRefreshing={isFetching}
			onRefresh={() => void refetch()}
		/>
	);
}

function OfferDetailSkeleton() {
	return (
		<Screen scroll>
			<View style={styles.container}>
				<ScreenHeader title={strings.business.productDetailTitle} />
				<Skeleton style={styles.hero} />
				<Skeleton style={styles.title} />
				<Skeleton style={styles.card} />
				<Skeleton style={styles.card} />
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, gap: spacing.lg },
	hero: { height: 240, borderRadius: radii.lg },
	title: { height: 28, borderRadius: radii.md },
	card: { height: 110, borderRadius: radii.lg },
});