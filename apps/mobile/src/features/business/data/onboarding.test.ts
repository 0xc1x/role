import { beforeEach, describe, expect, jest, mock, test } from "bun:test";

const storage = new Map<string, string>();
const signUpWithEmail = jest.fn();
const createBusiness = jest.fn();

mock.module("@react-native-async-storage/async-storage", () => ({
	default: {
		getItem: jest.fn(async (key: string) => storage.get(key) ?? null),
		setItem: jest.fn(async (key: string, value: string) => {
			storage.set(key, value);
		}),
		removeItem: jest.fn(async (key: string) => {
			storage.delete(key);
		}),
	},
}));

mock.module("@/src/features/auth/data/repository", () => ({
	authRepository: { signUpWithEmail },
}));

mock.module("@/src/features/business/data/repository", () => ({
	businessRepository: { createBusiness },
}));

const { pendingBusinessOnboardingRepository, submitBusinessOwnerOnboarding } =
	await import("./onboarding");

const input = {
	fullName: "Owner Name",
	email: "owner@example.com",
	password: "secret123",
	businessName: "Owner Business",
	businessPhone: "+593900000000",
	analyticsConsentGranted: false,
};

const storageKey = (ownerId: string) =>
	`role.pending-business-onboarding.v1:${ownerId}`;

describe("business owner onboarding", () => {
	beforeEach(() => {
		storage.clear();
		signUpWithEmail.mockReset();
		createBusiness.mockReset();
		createBusiness.mockResolvedValue(undefined);
	});

	test("defers business creation when email confirmation is required", async () => {
		signUpWithEmail.mockResolvedValue({
			userId: "owner-1",
			requiresEmailConfirmation: true,
			profile: null,
		});

		const result = await submitBusinessOwnerOnboarding(input);

		expect(result).toEqual({ status: "confirmation_required" });
		expect(signUpWithEmail).toHaveBeenCalledWith(
			expect.objectContaining({ analyticsConsentGranted: false }),
		);
		expect(createBusiness).not.toHaveBeenCalled();
		expect(storage.get(storageKey("owner-1"))).toContain("Owner Business");
	});

	test("forwards an explicit analytics opt-in", async () => {
		signUpWithEmail.mockResolvedValue({
			userId: "owner-consent",
			requiresEmailConfirmation: true,
			profile: null,
		});

		await submitBusinessOwnerOnboarding({
			...input,
			analyticsConsentGranted: true,
		});

		expect(signUpWithEmail).toHaveBeenCalledWith(
			expect.objectContaining({ analyticsConsentGranted: true }),
		);
	});

	test("creates the business immediately with a confirmed signup session", async () => {
		signUpWithEmail.mockResolvedValue({
			userId: "owner-2",
			requiresEmailConfirmation: false,
			profile: { id: "owner-2" },
		});

		const result = await submitBusinessOwnerOnboarding(input);

		expect(result).toEqual({ status: "completed" });
		expect(createBusiness).toHaveBeenCalledTimes(1);
		expect(createBusiness).toHaveBeenCalledWith(
			expect.objectContaining({
				ownerId: "owner-2",
				name: "Owner Business",
				slug: "onboarding-owner-2",
			}),
		);
		expect(storage.has(storageKey("owner-2"))).toBe(false);
	});

	test("completes deferred onboarding only for the confirmed owner", async () => {
		signUpWithEmail.mockResolvedValue({
			userId: "owner-3",
			requiresEmailConfirmation: true,
			profile: null,
		});
		await submitBusinessOwnerOnboarding(input);

		await expect(
			pendingBusinessOnboardingRepository.complete("another-user"),
		).resolves.toBe(false);
		expect(createBusiness).not.toHaveBeenCalled();

		await expect(
			pendingBusinessOnboardingRepository.complete("owner-3"),
		).resolves.toBe(true);
		expect(createBusiness).toHaveBeenCalledTimes(1);
		expect(storage.has(storageKey("owner-3"))).toBe(false);
	});
});
