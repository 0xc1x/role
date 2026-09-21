import { StyleSheet, View } from "react-native";
import { toast } from "sonner-native";

import { strings } from "@/src/core/i18n/strings";
import {
	ErrorState,
	goBackOr,
	Screen,
	ScreenHeader,
} from "@/src/core/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/src/core/theme";
import { useAuthStore } from "@/src/features/auth/store";
import {
	useBusinesses,
	useBusinessHours,
	useBusinessProfile,
	useUpdateBusiness,
} from "@/src/features/business/hooks";
import { BusinessForm } from "@/src/features/business/components/BusinessForm";
import { NoBusinessPrompt } from "@/src/features/business/components/NoBusinessPrompt";
import { spacing, radii } from "@/src/core/theme/spacing";

/** Edición del negocio con paridad total: mismos campos que la creación. */export default function BusinessEditScreen() {
	const initialized = useAuthStore((s) => s.initialized);
	const profile = useAuthStore((s) => s.profile);
	const { data: businesses, isLoading: businessesLoading } = useBusinesses(
		profile?.id ?? "",
	);
	const business = businesses?.[0];
	const businessId = business?.id ?? "";
	const { data, isLoading, isError, error, refetch, fetchStatus } =
		useBusinessProfile(businessId);
	const { data: hours } = useBusinessHours(businessId);
	const update = useUpdateBusiness(businessId);

	// Temporary diagnostic log for Expo logs; remove after debugging.
	console.log("[edit-business]", {
		initialized,
		profileId: profile?.id,
		businessesLen: businesses?.length,
		businessId,
		isLoading,
		isError,
		errorMessage: String(error),
		hasData: Boolean(data),
		fetchStatus,
	});

	if (!initialized || businessesLoading) return <BusinessFormSkeleton />;
	if (!business) return <NoBusinessPrompt />;
	if (isLoading) return <BusinessFormSkeleton />;
	if (isError)
		return (
			<Screen scroll>
				<View style={styles.container}>
					<ScreenHeader
						title={strings.business.editBusinessTitle}
						fallback="/(business)/management"
					/>
					<ErrorState error={error} onRetry={() => void refetch()} />
				</View>
			</Screen>
		);
	if (!data) return <BusinessFormSkeleton />;

	return (
		<Screen scroll>
			<View style={styles.container}>
				<ScreenHeader
					title={strings.business.editBusinessTitle}
					fallback="/(business)/management"
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
								goBackOr("/(business)/management");
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

function BusinessFormSkeleton() {
	const { colors } = useTheme();
	const skeletonStyle = { backgroundColor: colors.borderSolid };
	return (
		<Screen scroll>
			<View style={styles.container}>
				<ScreenHeader
					title={strings.business.editBusinessTitle}
					fallback="/(business)/management"
				/>
				{[0, 1, 2, 3, 4].map((i) => (
					<Skeleton
						key={`business-form-skeleton-${i}`}
						style={[styles.skeletonField, skeletonStyle]}
					/>
				))}
				<Skeleton style={[styles.skeletonCta, skeletonStyle]} />
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, gap: spacing.md },
	skeletonField: { height: 56, borderRadius: radii.md },
	skeletonCta: { height: 48, borderRadius: radii.md, marginTop: spacing.sm },
});
