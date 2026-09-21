import { useLocalSearchParams } from "expo-router";

import { strings } from "@/src/core/i18n/strings";
import { LoadingView, Screen, ScreenHeader, spacing } from "@/src/core/ui";
import { ProductForm } from "@/src/features/business/components/products/ProductForm";
import { StyleSheet } from "react-native";


export default function NewProductScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const businessId = id ?? "";

	if (!businessId) return <LoadingView />;

	return (
		<Screen scroll style={styles.container}>
			<ScreenHeader title={strings.business.newProduct} />
			<ProductForm businessId={businessId} />
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl },
});