import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { toast } from "sonner-native";

import { strings } from "@/core/i18n/strings";
import { ErrorState, LoadingView, Screen, ScreenHeader } from "@/core/ui";
import { useAuthStore } from "@/features/auth/store";
import {
	useBusinesses,
	useBusinessHours,
	useBusinessProfile,
	useUpdateBusiness,
} from "@/features/business/hooks";
import { BusinessForm } from "@/features/business/components/BusinessForm";
import { spacing } from "@/core/theme/spacing";

/** Edición del negocio con paridad total: mismos campos que la creación. */
export default function BusinessEditScreen() {
	const profile = useAuthStore((s) => s.profile);
	const { data: businesses } = useBusinesses(profile?.id ?? "");
	const businessId = businesses?.[0]?.id ?? "";
	const { data, isLoading, isError, error, refetch } = useBusinessProfile(
		businessId,
	);
	const { data: hours } = useBusinessHours(businessId);
	const update = useUpdateBusiness(businessId);

	if (isLoading) return <LoadingView />;
	if (isError)
		return <ErrorState error={error} onRetry={() => void refetch()} />;
	if (!data) return <LoadingView />;

	return (
		<Screen scroll>
			<View style={styles.container}>
				<ScreenHeader
					title={strings.business.editBusinessTitle}
					onBack={() =>
						router.canGoBack()
							? router.back()
							: router.replace("/(business)/business-profile")
					}
				/>
				<BusinessForm
					// key: el form hidrata su estado al montar; remonta cuando
					// llegan los datos (horarios cargan async).
					key={`${data.business.id}-${hours ? "ready" : "loading"}`}
					initial={{
						name: data.business.name ?? "",
						type: data.business.type,
						phone: data.business.phone,
						email: data.business.email,
						description: data.business.description,
						website: data.business.website,
						logoUri: data.business.image,
						coverUri: data.business.cover_image,
						address: data.address,
						latitude: data.latitude,
						longitude: data.longitude,
						zone: data.zone,
						hours,
					}}
					submitLabel={strings.business.couponSave}
					pending={update.isPending}
					onSubmit={(input) =>
						update.mutate(input, {
							onSuccess: () => {
								toast.success(strings.business.businessCreated);
								router.back();
							},
							onError: (e) =>
								toast.error(
									e instanceof Error
										? e.message
										: strings.business.editBusinessError,
								),
						})
					}
				/>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, gap: spacing.md },
});
