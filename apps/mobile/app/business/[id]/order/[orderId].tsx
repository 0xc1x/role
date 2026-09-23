import { useLocalSearchParams } from "expo-router";

import { ErrorState, LoadingView } from "@/src/core/ui";
import { useOrder } from "@/src/features/hooks";
import { OrderDetail } from "@/src/features/business/components/orders/OrderDetail";

export default function BusinessOrderDetailScreen() {
	const { id, orderId } = useLocalSearchParams<{
		id: string;
		orderId: string;
	}>();
	const businessId = id ?? "";

	// Single-row fetch: the orders list is paginated + server-filtered now,
	// so the item may not be in any loaded page.
	const {
		data: item,
		isLoading,
		isError,
		error,
		refetch,
		isFetching,
	} = useOrder(orderId ?? "");

	if (isLoading) return <LoadingView />;
	if (isError || !item)
		return <ErrorState error={error} onRetry={() => void refetch()} />;

	return (
		<OrderDetail
			businessId={businessId}
			item={item}
			isRefreshing={isFetching}
			onRefresh={() => void refetch()}
		/>
	);
}