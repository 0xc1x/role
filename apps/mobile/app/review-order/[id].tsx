import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	Button,
	Card,
	ErrorState,
	LoadingView,
	Screen,
	ScreenHeader,
	TextField,
} from "@/core/ui";
import { useOrder, useSubmitReview } from "@/features/hooks";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

function Stars({
	value,
	onChange,
	colors,
}: {
	value: number;
	onChange: (v: number) => void;
	colors: ReturnType<typeof useTheme>["colors"];
}) {
	return (
		<View style={styles.stars}>
			{[1, 2, 3, 4, 5].map((n) => (
				<Pressable
					key={n}
					onPress={() => onChange(n)}
					accessibilityRole="button"
				>
					<AppText
						variant="h1"
						style={{ color: n <= value ? colors.warning : colors.muted }}
					>
						★
					</AppText>
				</Pressable>
			))}
		</View>
	);
}

export default function ReviewOrderScreen() {
	const { colors } = useTheme();
	const { id } = useLocalSearchParams<{ id: string }>();
	const { data, isLoading, isError, error, refetch } = useOrder(id ?? "");
	const submit = useSubmitReview();
	const [productRating, setProductRating] = useState(5);
	const [businessRating, setBusinessRating] = useState(5);
	const [comment, setComment] = useState("");

	if (isLoading) return <LoadingView />;
	if (isError || !data)
		return <ErrorState error={error} onRetry={() => void refetch()} />;

	const handleSubmit = () => {
		submit.mutate(
			{
				orderId: data.order.id,
				businessId: data.order.business_id,
				productRating,
				businessRating,
				comment: comment.trim() || undefined,
			},
			{
				onSuccess: () => router.back(),
			},
		);
	};

	return (
		<Screen scroll keyboardShouldPersistTaps="handled">
			<View style={styles.container}>
				<ScreenHeader title={strings.orders.writeReview} />
				<AppText variant="bodyMedium" style={{ color: colors.mutedForeground }}>
					{data.offerTitle} · {data.businessName}
				</AppText>

				<Card style={{ marginTop: spacing.lg }}>
					<AppText
						variant="bodyMedium"
						weight="semiBold"
						style={{ marginBottom: spacing.sm }}
					>
						{strings.orders.rateProduct}
					</AppText>
					<Stars value={productRating} onChange={setProductRating} colors={colors} />
				</Card>

				<Card style={{ marginTop: spacing.md }}>
					<AppText
						variant="bodyMedium"
						weight="semiBold"
						style={{ marginBottom: spacing.sm }}
					>
						{strings.orders.rateBusiness}
					</AppText>
					<Stars value={businessRating} onChange={setBusinessRating} colors={colors} />
				</Card>

				<View style={{ marginTop: spacing.lg }}>
					<TextField
						label={strings.orders.reviewComment}
						value={comment}
						onChangeText={setComment}
						multiline
					/>
				</View>

				<Button
					label={strings.orders.submitReview}
					onPress={handleSubmit}
					loading={submit.isPending}
					fullWidth
					style={{ marginTop: spacing.lg }}
				/>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl },
	stars: { flexDirection: "row", gap: spacing.sm },
});
