import { useLocalSearchParams } from "expo-router";

import { ErrorState, LoadingView } from "@/core/ui";
import { useBusinessOrders } from "@/features/business/hooks";
import { OrderDetail } from "@/features/business/components/orders/OrderDetail";

export default function BusinessOrderDetailScreen() {
	const { id, orderId } = useLocalSearchParams<{
		id: string;
		orderId: string;
	}>();
	const businessId = id ?? "";

	const {
		data: orders,
		isLoading,
		isError,
		error,
		refetch,
	} = useBusinessOrders(businessId);

	const item = orders?.find((o) => o.order.id === orderId);

	if (isLoading) return <LoadingView />;
	if (isError || !item)
		return <ErrorState error={error} onRetry={() => void refetch()} />;

	return <OrderDetail businessId={businessId} item={item} />;
}