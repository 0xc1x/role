import { useLocalSearchParams } from "expo-router";

import { strings } from "@/core/i18n/strings";
import { LoadingView, Screen, ScreenHeader } from "@/core/ui";
import { ProductForm } from "@/features/business/components/products/ProductForm";

export default function NewProductScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const businessId = id ?? "";

	if (!businessId) return <LoadingView />;

	return (
		<Screen scroll>
			<ScreenHeader title={strings.business.newProduct} />
			<ProductForm businessId={businessId} />
		</Screen>
	);
}