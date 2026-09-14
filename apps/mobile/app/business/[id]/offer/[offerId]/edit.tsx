import { useLocalSearchParams } from "expo-router";

import { strings } from "@/core/i18n/strings";
import { ErrorState, Screen, ScreenHeader } from "@/core/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { radii, spacing } from "@/core/theme/spacing";
import { StyleSheet, View } from "react-native";

import { ProductForm } from "@/features/business/components/products/ProductForm";
import { useOffer } from "@/features/hooks";

export default function EditProductScreen() {
	const { id, offerId } = useLocalSearchParams<{ id: string; offerId: string }>();
	const businessId = id ?? "";

	const { data: product, isLoading, isError, error, refetch } = useOffer(offerId ?? "");

	if (isLoading) return <ProductFormSkeleton />;
	if (isError || !product)
		return <ErrorState error={error} onRetry={() => void refetch()} />;

	return (
		<Screen scroll style={styles.container}>
			<ScreenHeader title={strings.business.editProduct} />
			<ProductForm businessId={businessId} product={product} />
		</Screen>
	);
}


function ProductFormSkeleton() {
	return (
		<Screen scroll>
			<View style={styles.container}>
				<ScreenHeader title={strings.business.editProduct} />
				<Skeleton style={styles.skeletonImage} />
				{[0, 1, 2, 3, 4, 5].map((i) => (
					<Skeleton key={`product-form-skeleton-${i}`} style={styles.skeletonField} />
				))}
				<Skeleton style={styles.skeletonCta} />
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, gap: spacing.md },
	skeletonImage: { height: 160, borderRadius: radii.lg },
	skeletonField: { height: 56, borderRadius: radii.md },
	skeletonCta: { height: 48, borderRadius: radii.md, marginTop: spacing.sm },
});
