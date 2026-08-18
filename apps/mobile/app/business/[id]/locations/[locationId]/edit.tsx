import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { ErrorState, LoadingView, Screen, ScreenHeader } from "@/core/ui";
import { spacing } from "@/core/theme/spacing";
import { useBusinessLocation, useUpsertLocation } from "@/features/business/hooks";
import {
	LocationForm,
	type LocationFormValues,
} from "@/features/business/components/LocationForm";

export default function BusinessLocationEditScreen() {
	const { id, locationId } = useLocalSearchParams<{
		id: string;
		locationId: string;
	}>();
	const businessId = id ?? "";
	const { data: location, isLoading, isError, error, refetch } =
		useBusinessLocation(locationId ?? "");
	const upsert = useUpsertLocation(businessId);
	const [submitting, setSubmitting] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);

	if (isLoading) return <LoadingView />;
	if (isError)
		return <ErrorState error={error} onRetry={() => void refetch()} />;
	if (!location) return null;

	const save = (values: LocationFormValues) => {
		setSubmitting(true);
		setFormError(null);
		upsert.mutate(
			{
				id: location.id,
				business_id: businessId,
				name: values.name,
				address: values.address,
				phone: values.phone.trim() ? values.phone.trim() : null,
				latitude: values.latitude,
				longitude: values.longitude,
				zone: values.zone,
			},
			{
				onSuccess: () => {
					setSubmitting(false);
					router.back();
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
			<ScreenHeader title={strings.business.editLocation} />
			<View style={styles.form}>
				<LocationForm
					initial={{
						name: location.name,
						address: location.address,
						phone: location.phone ?? "",
						latitude: location.latitude,
						longitude: location.longitude,
						zone: location.zone,
					}}
					submitLabel={strings.business.couponSave}
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
	form: { marginTop: spacing.xl },
});