import { useLocalSearchParams } from "expo-router";

import { strings } from "@/core/i18n/strings";
import { ErrorState, LoadingView, Screen, ScreenHeader, spacing } from "@/core/ui";
import { StyleSheet } from "react-native";

import { ProductForm } from "@/features/business/components/products/ProductForm";
import { useOffer } from "@/features/hooks";

export default function EditProductScreen() {
	const { id, offerId } = useLocalSearchParams<{ id: string; offerId: string }>();
	const businessId = id ?? "";

	const { data: product, isLoading, isError, error, refetch } = useOffer(offerId ?? "");

	if (isLoading) return <LoadingView />;
	if (isError || !product)
		return <ErrorState error={error} onRetry={() => void refetch()} />;

	return (
		<Screen scroll style={styles.container}>
			<ScreenHeader title={strings.business.editProduct} />
			<ProductForm businessId={businessId} product={product} />
		</Screen>
	);
}


const styles = StyleSheet.create({
	container: { padding: spacing.xl },
});
