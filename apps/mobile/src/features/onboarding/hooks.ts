import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuthStore } from "@/src/features/auth/store";

import { hasSeenOnboarding, markOnboardingSeen } from "./data/repository";
import { shouldShowOnboarding } from "./domain/onboarding";

/** Key por viewer: invitado y cada cuenta viven en su propio ámbito. */
export function onboardingSeenQueryKey(profileId: string | null | undefined) {
	return ["onboarding", "seen", profileId ?? "guest"] as const;
}

export const onboardingStateQueryOptions = (
	profileId: string | null | undefined,
) => ({
	queryKey: onboardingSeenQueryKey(profileId),
	queryFn: () => hasSeenOnboarding(profileId),
	// Local (AsyncStorage): solo se consulta al montar el gate/pantalla.
	staleTime: 5 * 60_000,
	gcTime: 30 * 60_000,
	retry: 1,
});

/**
 * Estado del onboarding del viewer vigente.
 * `resolved` es obligatorio en el gate (app/index.tsx): sin esperarlo,
 * navegaría al home consumer antes de leer storage y "flashearía" la pantalla.
 */
export function useOnboardingState() {
	const profile = useAuthStore((s) => s.profile);
	const query = useQuery(onboardingStateQueryOptions(profile?.id ?? null));
	return {
		/** true cuando AsyncStorage resolvió; el gate no navega antes. */
		resolved: query.isSuccess,
		showOnboarding: shouldShowOnboarding(
			profile?.role ?? null,
			query.data === true,
		),
	};
}

/**
 * Marca el onboarding como visto para el viewer vigente e invalida su key.
 * El repositorio nunca rechaza; `onSuccess` fija la caché a `true` ANTES de
 * que la pantalla navegue, para que un back al gate no relea la marca vieja.
 */
export function useMarkOnboardingSeen() {
	const queryClient = useQueryClient();
	const profileId = useAuthStore((s) => s.profile?.id ?? null);
	return useMutation({
		mutationFn: () => markOnboardingSeen(profileId),
		onSuccess: () => {
			queryClient.setQueryData(onboardingSeenQueryKey(profileId), true);
			void queryClient.invalidateQueries({
				queryKey: onboardingSeenQueryKey(profileId),
			});
		},
	});
}
