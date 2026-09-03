import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { goBackOr, Screen, ScreenHeader } from "@/core/ui";
import { useAuthStore } from "@/features/auth/store";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import { useBusinesses, useUpsertLocation } from "@/features/business/hooks";
import {
	LocationForm,
	type LocationFormValues,
} from "@/features/business/components/LocationForm";

export default function BusinessLocationCreateScreen() {
	const { colors } = useTheme();
	const profile = useAuthStore((s) => s.profile);
	const { data: businesses } = useBusinesses(profile?.id ?? "");
	const businessId = businesses?.[0]?.id ?? "";
	const upsert = useUpsertLocation(businessId);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const save = (values: LocationFormValues) => {
		setSubmitting(true);
		setError(null);
		upsert.mutate(
			{
				business_id: businessId,
				name: values.name,
				address: values.address,
				phone: values.phone.trim() ? values.phone.trim() : null,
				latitude: values.latitude,
				longitude: values.longitude,
				zone: values.zone,
				is_active: true,
			},
			{
				onSuccess: () => {
					setSubmitting(false);
					goBackOr(`/business/${businessId}/locations`);
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
			<ScreenHeader title={strings.business.newLocation} />
			<View style={styles.form}>
				<LocationForm
					submitLabel={strings.business.createLocation}
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
	form: { marginTop: spacing.xl },
});