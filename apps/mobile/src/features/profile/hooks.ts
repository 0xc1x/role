import {
	useMutation,
	useQuery,
	useQueryClient,
	type QueryClient,
} from "@tanstack/react-query";
import type { AddressType } from "@0xc1x/role-commons";

import { profileRepository } from "@/src/features/profile/data/repository";
import { authRepository } from "@/src/features/auth/data/repository";
import type { UserProfile } from "@/src/features/auth/domain/user";
import { useAuthStore } from "@/src/features/auth/store";

// ─── Saved addresses ────────────────────────────────────────────────
export function useSavedAddresses(userId: string) {
	return useQuery({
		queryKey: ["addresses", userId],
		queryFn: () => profileRepository.getSavedAddresses(userId),
		enabled: userId.length > 0,
	});
}

export function useSaveAddress(userId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			label: string;
			address: string;
			latitude: number;
			longitude: number;
			type: AddressType;
			references?: string | null;
			housingType?: string | null;
		}) => profileRepository.saveAddress({ ...input, userId }),
		onSuccess: () =>
			void queryClient.invalidateQueries({ queryKey: ["addresses", userId] }),
	});
}

export function useUpdateAddress(userId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (
			input: Parameters<typeof profileRepository.updateAddress>[0],
		) => profileRepository.updateAddress(input),
		onSuccess: () =>
			void queryClient.invalidateQueries({ queryKey: ["addresses", userId] }),
	});
}

export function useDeleteAddress(userId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => profileRepository.deleteAddress(id),
		onSuccess: () =>
			void queryClient.invalidateQueries({ queryKey: ["addresses", userId] }),
	});
}

export function useSetDefaultAddress(userId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => profileRepository.setDefaultAddress(id, userId),
		onSuccess: () =>
			void queryClient.invalidateQueries({ queryKey: ["addresses", userId] }),
	});
}

// ─── Preferences ────────────────────────────────────────────────────
export function usePreferences(userId: string) {
	return useQuery({
		queryKey: ["preferences", userId],
		queryFn: () => profileRepository.getPreferences(userId),
		enabled: userId.length > 0,
	});
}

export function useUpdatePreferences(userId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (
			prefs: Parameters<typeof profileRepository.updatePreferences>[1],
		) => profileRepository.updatePreferences(userId, prefs),
		onSuccess: () =>
			void queryClient.invalidateQueries({ queryKey: ["preferences", userId] }),
	});
}

// ─── Marketing preferences ──────────────────────────────────────────
export function useMarketingPreferences(userId: string) {
	return useQuery({
		queryKey: ["marketingPrefs", userId],
		queryFn: () => profileRepository.getMarketingPreferences(userId),
		enabled: userId.length > 0,
	});
}

export function useUpdateMarketingPreferences(userId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (isSubscribed: boolean) =>
			profileRepository.setMarketingSubscribed(userId, isSubscribed),
		onSuccess: () =>
			void queryClient.invalidateQueries({
				queryKey: ["marketingPrefs", userId],
			}),
	});
}

// ─── Notification preferences ───────────────────────────────────────
export function useNotificationPreferences(userId: string) {
	return useQuery({
		queryKey: ["notificationPrefs", userId],
		queryFn: () => profileRepository.getNotificationPreferences(userId),
		enabled: userId.length > 0,
	});
}

export function useUpdateNotificationPreferences(userId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (
			prefs: Parameters<
				typeof profileRepository.updateNotificationPreferences
			>[1],
		) => profileRepository.updateNotificationPreferences(userId, prefs),
		onSuccess: () =>
			void queryClient.invalidateQueries({
				queryKey: ["notificationPrefs", userId],
			}),
	});
}

// ─── Profile + stats ────────────────────────────────────────────────
type ProfileWritePatch = {
	full_name?: string;
	email?: string;
	phone?: string | null;
	city?: string | null;
};

/**
 * Aplica al perfil del store solo los campos presentes en el patch.
 *
 * `!== undefined` y no truthiness: `""` y `null` son valores legítimos
 * (borrar el teléfono, dejar el nombre sin relleno) y no deben caerse al valor
 * anterior.
 */
function applyPatch(
	profile: UserProfile,
	patch: ProfileWritePatch,
): UserProfile {
	return {
		...profile,
		fullName:
			patch.full_name !== undefined ? patch.full_name : profile.fullName,
		email: patch.email !== undefined ? patch.email : profile.email,
		phone: patch.phone !== undefined ? patch.phone : profile.phone,
		city: patch.city !== undefined ? patch.city : profile.city,
	};
}

/**
 * Reconcilia el perfil del store después de una escritura ya confirmada.
 *
 * POR QUÉ NO HAY UNA QUERY QUE INVALIDAR: el perfil vive en el store de sesión
 * (Zustand), no en la caché de React Query, así que la relectura es el único
 * mecanismo de sincronización. Antes, si esa relectura fallaba, el `if (profile)`
 * era falso y la UI seguía mostrando el nombre y el teléfono anteriores con un
 * toast de "guardado": un dato viejo con un éxito aparente.
 *
 * El servidor ya confirmó la escritura, así que el patch no es especulativo: si
 * la relectura falla se aplica al store en vez de dejar el valor viejo, y la
 * siguiente relectura (arranque de sesión, próximo guardado) lo reconcilia. La
 * invalidación de `userStats` sigue siendo la vía para las estadísticas derivadas.
 */
async function syncProfileAfterWrite(
	queryClient: QueryClient,
	userId: string,
	patch: ProfileWritePatch,
): Promise<void> {
	void queryClient.invalidateQueries({ queryKey: ["userStats", userId] });
	// La relectura trae el consentimiento leído de `user_consents`, así que un
	// fallo de esa lectura no puede devolver un `false` que revoca lo que el
	// usuario concedió. Se pasa el valor conocido solo si la fila es la misma:
	// el store puede tener el perfil de otra cuenta.
	const before = useAuthStore.getState().profile;
	const knownConsent =
		before?.id === userId ? before.analyticsConsentGranted : false;
	const profile = await authRepository
		.fetchProfile(userId, knownConsent)
		.catch(() => null);
	if (profile) {
		useAuthStore.getState().setProfile(profile);
		return;
	}
	const current = useAuthStore.getState().profile;
	// Otra sesión en el store: no se pisa el perfil de quien está autenticado ahora.
	if (!current || current.id !== userId) return;
	useAuthStore.getState().setProfile(applyPatch(current, patch));
}

export function useProfileStats(userId: string) {
	return useQuery({
		queryKey: ["userStats", userId],
		queryFn: () => profileRepository.getUserStats(userId),
		enabled: userId.length > 0,
	});
}

export function useUpdateProfile(userId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (patch: {
			full_name?: string;
			email?: string;
			phone?: string | null;
			city?: string | null;
		}) => profileRepository.updateProfile(userId, patch),
		onSuccess: async (_updated, patch) => {
			await syncProfileAfterWrite(queryClient, userId, patch);
		},
	});
}

// ─── Platform stats (public) ────────────────────────────────────────
export function usePlatformStats() {
	return useQuery({
		queryKey: ["platformStats"],
		queryFn: () => profileRepository.getPlatformStats(),
		staleTime: 60_000,
	});
}

// ─── Payment methods (device-local) ─────────────────────────────────
export function usePaymentMethods(userId: string) {
	return useQuery({
		queryKey: ["paymentMethods", userId],
		queryFn: () => profileRepository.getPaymentMethods(userId),
		enabled: userId.length > 0,
	});
}

export function useSetDefaultPaymentMethod(userId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) =>
			profileRepository.setDefaultPaymentMethod(userId, id),
		onSuccess: () =>
			void queryClient.invalidateQueries({
				queryKey: ["paymentMethods", userId],
			}),
	});
}

export function useDeletePaymentMethod(userId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) =>
			profileRepository.deletePaymentMethod(userId, id),
		onSuccess: () =>
			void queryClient.invalidateQueries({
				queryKey: ["paymentMethods", userId],
			}),
	});
}

/** Guarda perfil + email (store de sesión se sincroniza vía fetchProfile). */
export function useSaveProfileWithEmail(userId: string, currentEmail: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: {
			fullName: string;
			email: string;
			phone: string | null;
			city: string | null;
		}) => {
			await profileRepository.updateProfile(userId, {
				full_name: input.fullName,
				email: input.email,
				phone: input.phone,
				city: input.city,
			});
			const emailChanged = input.email !== currentEmail;
			if (emailChanged) {
				await authRepository.updateEmail(input.email);
			}
			return { emailChanged };
		},
		onSuccess: async (_result, input) => {
			await syncProfileAfterWrite(queryClient, userId, {
				full_name: input.fullName,
				email: input.email,
				phone: input.phone,
				city: input.city,
			});
		},
	});
}
