import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BusinessType } from "@0xc1x/role-commons";

import { toAppError } from "@/src/core/error/mapper";
import { authRepository } from "@/src/features/auth/data/repository";

import { businessRepository } from "./repository";

const STORAGE_PREFIX = "role.pending-business-onboarding.v1:";
const completing = new Set<string>();

export interface BusinessOwnerOnboardingInput {
	fullName: string;
	email: string;
	password: string;
	businessName: string;
	businessPhone: string;
	analyticsConsentGranted: boolean;
}

interface PendingBusinessOnboarding {
	ownerId: string;
	name: string;
	type: BusinessType;
	phone: string | null;
	email: string;
}

export type BusinessOwnerOnboardingResult =
	| { status: "confirmation_required" }
	| { status: "completed" };

function storageKey(ownerId: string): string {
	return `${STORAGE_PREFIX}${ownerId}`;
}

export const pendingBusinessOnboardingRepository = {
	async save(
		ownerId: string,
		input: Omit<
			BusinessOwnerOnboardingInput,
			"fullName" | "password" | "analyticsConsentGranted"
		>,
	): Promise<void> {
		const pending: PendingBusinessOnboarding = {
			ownerId,
			name: input.businessName,
			type: "restaurant",
			phone: input.businessPhone || null,
			email: input.email,
		};
		await AsyncStorage.setItem(storageKey(ownerId), JSON.stringify(pending));
	},

	/**
	 * Creates the business only for the confirmed Auth user that owns the
	 * pending payload. A deterministic slug makes a retry after a successful
	 * insert idempotent.
	 */
	async complete(authenticatedUserId: string): Promise<boolean> {
		if (completing.has(authenticatedUserId)) return false;

		const key = storageKey(authenticatedUserId);
		const raw = await AsyncStorage.getItem(key);
		if (!raw) return false;

		let pending: PendingBusinessOnboarding;
		try {
			pending = JSON.parse(raw) as PendingBusinessOnboarding;
		} catch {
			await AsyncStorage.removeItem(key);
			return false;
		}
		if (pending.ownerId !== authenticatedUserId) return false;

		completing.add(authenticatedUserId);
		try {
			try {
				await businessRepository.createBusiness({
					ownerId: authenticatedUserId,
					name: pending.name,
					type: pending.type,
					phone: pending.phone,
					email: pending.email,
					description: null,
					website: null,
					logoUri: null,
					coverUri: null,
					hours: [],
					slug: `onboarding-${authenticatedUserId}`,
				});
			} catch (error) {
				// The deterministic onboarding slug is unique to this Auth user.
				// A duplicate means a previous attempt already created the row.
				if (toAppError(error).kind !== "conflict") throw error;
			}
			await AsyncStorage.removeItem(key);
			return true;
		} finally {
			completing.delete(authenticatedUserId);
		}
	},
};

export async function submitBusinessOwnerOnboarding(
	input: BusinessOwnerOnboardingInput,
): Promise<BusinessOwnerOnboardingResult> {
	const signup = await authRepository.signUpWithEmail({
		fullName: input.fullName,
		email: input.email,
		password: input.password,
		role: "business",
		analyticsConsentGranted: input.analyticsConsentGranted,
	});

	await pendingBusinessOnboardingRepository.save(signup.userId, {
		businessName: input.businessName,
		businessPhone: input.businessPhone,
		email: input.email,
	});

	if (signup.requiresEmailConfirmation) {
		return { status: "confirmation_required" };
	}

	await pendingBusinessOnboardingRepository.complete(signup.userId);
	return { status: "completed" };
}
