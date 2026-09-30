import { beforeEach, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without @types/react-dom in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { light } from "@/src/core/theme/colors";
import { strings } from "@/src/core/i18n/strings";
import { mockNativeUi } from "@/src/test-utils/native-mocks";

// Home drives the first purchase: an offline 401 or an RLS denial must not be
// indistinguishable from an empty marketplace.

const refetch = mock(() => Promise.resolve());
const errorStates: { error: unknown; onRetry?: () => void }[] = [];
const wrapper = ({ children }: { children?: ReactNode }) =>
	createElement(nativeWeb.View, null, children);
const empty = () => null;

type SectionQuery = {
	data?: unknown[];
	isLoading: boolean;
	isError: boolean;
	error?: unknown;
	refetch: () => Promise<unknown>;
};

let popular: SectionQuery;
let nearby: SectionQuery;

mockNativeUi({ FlatList: empty, ScrollView: wrapper });

mock.module("expo-router", () => ({ router: { push: () => {} } }));
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light }),
}));
mock.module("@/src/core/ui", () => ({
	AppText: nativeWeb.Text,
	SectionHeader: () => null,
	Card: wrapper,
	ErrorState: (props: { error: unknown; onRetry?: () => void }) => {
		errorStates.push(props);
		return createElement(nativeWeb.Text, null, "ERROR_STATE");
	},
}));
mock.module("@/src/features/offers/components/OfferCard", () => ({
	OfferCard: empty,
}));
mock.module("@/src/features/hooks", () => ({
	usePopularOffers: () => popular,
	useExpiringSoonOffers: () => popular,
	useRecentOffers: () => popular,
	useNearbyOffersHook: () => nearby,
	useSelectedAddress: () => ({ latitude: 1, longitude: 2 }),
}));

const { OfferRowSection, OfferColumnSection } = await import(
	"./OfferRowSection"
);

beforeEach(() => {
	errorStates.length = 0;
	refetch.mockClear();
	const denied = {
		code: "42501",
		message: "permission denied for table offers",
	};
	popular = {
		data: undefined,
		isLoading: false,
		isError: true,
		error: denied,
		refetch,
	};
	nearby = {
		data: undefined,
		isLoading: false,
		isError: true,
		error: denied,
		refetch,
	};
});

test("a failed row section shows an error state with retry, not the empty copy", () => {
	const html = renderToStaticMarkup(
		createElement(OfferRowSection, {
			type: "popular",
			title: strings.home.ofertasPopulares,
		}),
	);

	expect(html).toContain("ERROR_STATE");
	expect(html).not.toContain(strings.home.noOffers);
	expect(html).not.toContain("permission denied");
	expect(errorStates[0]?.error).toBe(popular.error);
	errorStates[0]?.onRetry?.();
	expect(refetch).toHaveBeenCalledTimes(1);
});

test("a failed nearby column section shows the same error state", () => {
	const html = renderToStaticMarkup(
		createElement(OfferColumnSection, { title: strings.home.cercaDeTi }),
	);

	expect(html).toContain("ERROR_STATE");
	expect(html).not.toContain(strings.home.noOffers);
	errorStates[0]?.onRetry?.();
	expect(refetch).toHaveBeenCalledTimes(1);
});

test("a genuinely empty section still collapses instead of showing an error", () => {
	popular = { data: [], isLoading: false, isError: false, refetch };

	const html = renderToStaticMarkup(
		createElement(OfferRowSection, {
			type: "popular",
			title: strings.home.ofertasPopulares,
		}),
	);

	expect(html).toBe("");
	expect(errorStates).toHaveLength(0);
});
