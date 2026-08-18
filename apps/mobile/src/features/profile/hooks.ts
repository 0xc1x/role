import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AddressType } from "@0xc1x/role-commons";

import { profileRepository } from "@/features/profile/data/repository";
import { authRepository } from "@/features/auth/data/repository";

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
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["userStats", userId] });
			return authRepository.fetchProfile(userId);
		},
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
