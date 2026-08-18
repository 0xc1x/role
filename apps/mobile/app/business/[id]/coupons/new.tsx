import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { Screen, ScreenHeader } from "@/core/ui";
import { useAuthStore } from "@/features/auth/store";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import { useBusinesses, useUpsertCoupon } from "@/features/business/hooks";
import {
	CouponForm,
	type CouponFormValues,
} from "@/features/business/components/CouponForm";

export default function BusinessCouponNewScreen() {
	const { colors } = useTheme();
	const profile = useAuthStore((s) => s.profile);
	const { data: businesses } = useBusinesses(profile?.id ?? "");
	const businessId = businesses?.[0]?.id ?? "";
	const upsert = useUpsertCoupon(businessId);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const save = (values: CouponFormValues) => {
		setSubmitting(true);
		setError(null);
		upsert.mutate(
			{
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
					router.back();
				},
				onError: (e) => {
					setSubmitting(false);
					setError(
						e instanceof Error ? e.message : strings.business.genericError,
					);
				},
			},
		);
	};

	return (
		<Screen scroll contentContainerStyle={styles.container}>
			<ScreenHeader title={strings.business.couponNewTitle} />
			<View style={{ marginTop: spacing.xl }}>
				<CouponForm
					publishLabel={strings.business.couponPublish}
					submitting={submitting}
					error={error}
					onSubmit={save}
				/>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl },
});