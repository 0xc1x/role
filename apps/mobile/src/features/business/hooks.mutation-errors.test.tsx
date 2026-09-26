import { expect, mock, test } from "bun:test";
import { createElement } from "react";
// @ts-expect-error react-dom is installed without declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { strings } from "@/src/core/i18n/strings";

// These eight business-management mutations were silent: the screens passed
// only `onSuccess`, so a rejected write showed a spinner, changed nothing and
// said nothing. Each one must now name its own operation — a shared "algo
// salió mal" leaves the owner unable to tell what to retry.

const toasts: string[] = [];

mock.module("sonner-native", () => ({
	toast: {
		error: (message: string) => toasts.push(message),
		success: () => {},
	},
}));

const boom = () => Promise.reject(new Error("driver said no"));

const businessRepository = {
	toggleOfferStatus: mock(boom),
	upsertLocation: mock(boom),
	toggleLocationStatus: mock(boom),
	upsertCoupon: mock(boom),
	toggleCouponStatus: mock(boom),
	createBusiness: mock(boom),
	updateBusiness: mock(boom),
};

mock.module("@/src/features/business/data/repository", () => ({
	businessRepository,
	deleteOffer: mock(boom),
	saveOffer: mock(async () => ({ imageUploadFailed: false })),
}));
mock.module("@/src/features/business/data/notifications", () => ({
	notificationRepository: {
		getPreferences: async () => ({}),
		updatePreferences: async () => ({}),
	},
}));
mock.module("@/src/features/orders/data/repository", () => ({
	orderRepository: {},
}));

const hooks = await import("@/src/features/business/hooks");

// The eight hooks each take their own variables shape; the probe only needs
// `mutateAsync` to hand a rejection back to the assertion.
interface Mutation {
	mutateAsync: (variables: any) => Promise<unknown>;
}

let current: Mutation;

function Probe({ useHook }: { useHook: () => Mutation }) {
	current = useHook();
	return null;
}

/** Fires a rejected mutation through a real QueryClient and returns the toasts. */
async function surfaceFailure(
	useHook: () => Mutation,
	variables: unknown,
): Promise<string[]> {
	const client = new QueryClient({
		defaultOptions: { mutations: { retry: false } },
	});
	renderToStaticMarkup(
		createElement(
			QueryClientProvider,
			{ client },
			createElement(Probe, { useHook }),
		),
	);
	toasts.length = 0;
	await current.mutateAsync(variables).catch(() => undefined);
	return [...toasts];
}

const CASES = [
	{
		operation: "toggle offer active",
		useHook: () => hooks.useToggleOfferActive("b-1"),
		variables: { offerId: "o-1", isActive: false },
		expected: strings.business.productToggleError,
	},
	{
		operation: "delete offer",
		useHook: () => hooks.useDeleteOffer("b-1"),
		variables: "o-1",
		expected: strings.business.productDeleteError,
	},
	{
		operation: "create business",
		useHook: () => hooks.useCreateBusiness(),
		variables: { name: "Panadería" },
		expected: strings.business.businessCreateError,
	},
	{
		operation: "update business",
		useHook: () => hooks.useUpdateBusiness("b-1"),
		variables: { name: "Panadería" },
		expected: strings.business.editBusinessError,
	},
	{
		operation: "upsert location",
		useHook: () => hooks.useUpsertLocation("b-1"),
		variables: { name: "Centro" },
		expected: strings.business.locationSaveError,
	},
	{
		operation: "toggle location status",
		useHook: () => hooks.useToggleLocationStatus("b-1"),
		variables: { id: "l-1", isActive: false },
		expected: strings.business.locationToggleError,
	},
	{
		operation: "upsert coupon",
		useHook: () => hooks.useUpsertCoupon("b-1"),
		variables: { code: "PROMO" },
		expected: strings.business.couponGenerateError,
	},
	{
		operation: "toggle coupon status",
		useHook: () => hooks.useToggleCouponStatus("b-1"),
		variables: { id: "c-1", isActive: false },
		expected: strings.business.couponToggleError,
	},
] as const;

for (const { operation, useHook, variables, expected } of CASES) {
	test(`${operation} surfaces its own error message`, async () => {
		expect(await surfaceFailure(useHook, variables)).toEqual([expected]);
	});
}

test("every business mutation names a different operation", () => {
	const messages = new Set(CASES.map((c) => c.expected));
	expect(messages.size).toBe(CASES.length);
	// No shared catch-all: that was the whole defect.
	expect(messages).not.toContain(strings.common.error);
	expect(messages).not.toContain(strings.business.genericError);
});
