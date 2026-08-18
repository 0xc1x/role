import { useLocalSearchParams } from "expo-router";

import { ErrorState, LoadingView } from "@/core/ui";
import { ProductDetail } from "@/features/business/components/products/ProductDetail";
import { useOffer } from "@/features/hooks";

export default function OfferDetailScreen() {
	const { id, offerId } = useLocalSearchParams<{ id: string; offerId: string }>();
	const businessId = id ?? "";

	const { data: product, isLoading, isError, error, refetch } = useOffer(offerId ?? "");

	if (isLoading) return <LoadingView />;
	if (isError || !product)
		return <ErrorState error={error} onRetry={() => void refetch()} />;

	return <ProductDetail businessId={businessId} product={product} />;
}