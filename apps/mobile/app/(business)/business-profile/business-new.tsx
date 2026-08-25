import { useEffect } from "react";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { toast } from "sonner-native";

import { strings } from "@/core/i18n/strings";
import { Screen, ScreenHeader } from "@/core/ui";
import { spacing } from "@/core/theme/spacing";
import { useAuthStore } from "@/features/auth/store";
import { useBusinesses, useCreateBusiness } from "@/features/business/hooks";
import { BusinessForm } from "@/features/business/components/BusinessForm";

/**
 * Creación de negocio para un usuario ya autenticado con rol business
 * (onboarding: products/orders/management cuando aún no tiene negocio).
 * El signup de negocio (/business-signup) es solo para usuarios no logueados.
 */
export default function BusinessNewScreen() {
	const profile = useAuthStore((s) => s.profile);
	const { data: businesses, isLoading } = useBusinesses(profile?.id ?? "");
	const create = useCreateBusiness();

	// Ya tiene negocio: nada que crear aquí.
	const hasBusiness = !isLoading && (businesses?.length ?? 0) > 0;
	useEffect(() => {
		if (hasBusiness) router.replace("/(business)/products");
	}, [hasBusiness]);

	if (hasBusiness) return null;

	return (
		<Screen scroll keyboardShouldPersistTaps="handled">
			<View style={styles.container}>
				<ScreenHeader title={strings.business.newBusinessTitle} />
				<BusinessForm
					submitLabel={strings.business.createBusiness}
					pending={create.isPending}
					onSubmit={(input) =>
						create.mutate(
							{ ...input, ownerId: profile?.id ?? "" },
							{
								onSuccess: () => {
									toast.success(strings.business.businessCreated);
									router.replace("/(business)/products");
								},
								onError: (e) =>
									toast.error(
										e instanceof Error
											? e.message
											: strings.business.createBusiness,
									),
							},
						)
					}
				/>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, gap: spacing.md },
});
