import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import {
	ErrorState,
	goBackOr,
	LoadingView,
	Screen,
	ScreenHeader,
} from "@/core/ui";
import { spacing } from "@/core/theme/spacing";
import { useBusinessCoupon, useUpsertCoupon } from "@/features/business/hooks";
import {
	CouponForm,
	type CouponFormValues,
} from "@/features/business/components/CouponForm";

export default function BusinessCouponEditScreen() {
	const { id, couponId } = useLocalSearchParams<{
		id: string;
		couponId: string;
	}>();
	const businessId = id ?? "";
	const { data: coupon, isLoading, isError, error, refetch } =
		useBusinessCoupon(couponId ?? "");
	const upsert = useUpsertCoupon(businessId);
	const [submitting, setSubmitting] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);

	if (isLoading) return <LoadingView />;
	if (isError)
		return <ErrorState error={error} onRetry={() => void refetch()} />;
	if (!coupon) return null;

	const save = (values: CouponFormValues) => {
		setSubmitting(true);
		setFormError(null);
		upsert.mutate(
			{
				id: coupon.id,
				business_id: businessId,
				code: values.code,
				name: values.name,
				type: values.type,
				value: values.value,
				min_order_amount: values.min_order_amount,
				max_uses: values.max_uses,
				expires_at: values.expires_at,
				is_active: values.is_active,
			},
			{
				onSuccess: () => {
					setSubmitting(false);
					goBackOr(`/business/${businessId}/coupons`);
				},
				onError: (e) => {
					setSubmitting(false);
					setFormError(
						e instanceof Error ? e.message : strings.business.genericError,
					);
				},
			},
		);
	};

	return (
		<Screen scroll contentContainerStyle={styles.container}>
			<ScreenHeader
				title={strings.business.couponEditTitle}
				fallback="/(business)/management"
			/>
			<View style={{ marginTop: spacing.xl }}>
				<CouponForm
					initial={coupon}
					publishLabel={strings.business.couponSave}
					submitting={submitting}
					error={formError}
					onSubmit={save}
				/>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl },
});