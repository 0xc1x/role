import { useEffect } from "react";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { toast } from "sonner-native";

import { strings } from "@/src/core/i18n/strings";
import { ErrorState, LoadingView, Screen, ScreenHeader } from "@/src/core/ui";
import { spacing } from "@/src/core/theme/spacing";
import { useAuthStore } from "@/src/features/auth/store";
import {
	useBusinesses,
	useCreateBusiness,
} from "@/src/features/business/hooks";
import { BusinessForm } from "@/src/features/business/components/BusinessForm";

/**
 * Creación de negocio para un usuario ya autenticado con rol business
 * (onboarding: products/orders/management cuando aún no tiene negocio).
 * El signup de negocio (/business-signup) es solo para usuarios no logueados.
 */
export default function BusinessNewScreen() {
	const profile = useAuthStore((s) => s.profile);
	const {
		data: businesses,
		isLoading,
		isError: businessesError,
		error: businessesErrorValue,
		refetch: refetchBusinesses,
	} = useBusinesses(profile?.id ?? "");
	const create = useCreateBusiness();

	// Ya tiene negocio: nada que crear aquí. El error se excluye a propósito:
	// sin datos no sabemos si ya tiene uno, y crear a ciegas duplicaría el
	// negocio de un dueño existente.
	const hasBusiness =
		!isLoading && !businessesError && (businesses?.length ?? 0) > 0;
	useEffect(() => {
		if (hasBusiness) router.replace("/(business)/products");
	}, [hasBusiness]);

	if (businessesError) {
		return (
			<ErrorState
				error={businessesErrorValue}
				onRetry={() => void refetchBusinesses()}
			/>
		);
	}

	// Guard de navegación: ya tiene negocio, el `useEffect` de arriba lo manda
	// al panel. Antes devolvía `null` mientras la navegación se aplicaba — un
	// frame en blanco. LoadingView mantiene la espera visible.
	if (hasBusiness) return <LoadingView />;

	return (
		<Screen scroll keyboardShouldPersistTaps="handled">
			<View style={styles.container}>
				<ScreenHeader
					title={strings.business.newBusinessTitle}
					fallback="/(business)/management"
				/>
				<BusinessForm
					submitLabel={strings.business.createBusiness}
					pending={create.isPending}
					onSubmit={(input) =>
						// El aviso de fallo lo emite el hook (copy es-ES nombrado por
						// operación); aquí solo vive el camino feliz.
						create.mutate(
							{ ...input, ownerId: profile?.id ?? "" },
							{
								onSuccess: () => {
									toast.success(strings.business.businessCreated);
									router.replace("/(business)/products");
								},
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
