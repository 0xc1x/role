import { expect, mock, test } from "bun:test";
import { createElement } from "react";
// @ts-expect-error react-dom is installed without declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { strings } from "@/src/core/i18n/strings";

// A review that never reached the server used to look like a saved one: the
// button un-spun, nothing was said, and the typed comment stayed in the form
// as if it had been published.

const toasts: string[] = [];

mock.module("sonner-native", () => ({
	toast: {
		error: (message: string) => toasts.push(message),
		success: () => {},
	},
}));
mock.module("@/src/features/auth/store", () => ({
	useAuthStore: (selector: (s: unknown) => unknown) =>
		selector({ profile: null }),
}));
mock.module("@/src/features/offers/data/repository", () => ({
	offersRepository: {},
}));
mock.module("@/src/features/favorites/data/repository", () => ({
	favoritesRepository: {},
}));
mock.module("@/src/features/profile/hooks", () => ({
	useSavedAddresses: () => ({}),
	usePreferences: () => ({}),
}));
const submitReview = mock(() =>
	Promise.reject({
		code: "42501",
		message: "permission denied for table reviews",
	}),
);
mock.module("@/src/features/orders/data/repository", () => ({
	orderRepository: { submitReview },
	createReservationIdempotencyKey: () => "key",
}));

const { useSubmitReview } = await import("@/src/features/hooks");

// The probe only needs `mutateAsync`; the variables type is the hook's own.
interface Mutation {
	mutateAsync: (variables: any) => Promise<unknown>;
}

let current: Mutation;

function Probe() {
	current = useSubmitReview();
	return null;
}

test("a rejected review submission surfaces an error instead of failing silently", async () => {
	const client = new QueryClient({
		defaultOptions: { mutations: { retry: false } },
	});
	renderToStaticMarkup(
		createElement(QueryClientProvider, { client }, createElement(Probe)),
	);

	toasts.length = 0;
	await current
		.mutateAsync({
			orderId: "order-1",
			businessId: "b-1",
			productRating: 5,
			businessRating: 4,
			comment: "El pan estaba buenísimo",
		})
		.catch(() => undefined);

	expect(submitReview).toHaveBeenCalledTimes(1);
	expect(toasts).toEqual([strings.orders.reviewSubmitError]);
	// The driver message is English and names the table: it is not UI copy.
	expect(toasts[0]).not.toContain("permission denied");
});
