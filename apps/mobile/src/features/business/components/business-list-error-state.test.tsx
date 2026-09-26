import { beforeEach, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without @types/react-dom in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { light } from "@/src/core/theme/colors";
import { mockNativeUi } from "@/src/test-utils/native-mocks";

// A failed `useBusinesses` must never read as "you have no business yet":
// that copy invites an existing owner to register a duplicate.

const ERROR_STATE = "ERROR_STATE";
const EMPTY_STATE = "NO_BUSINESS_PROMPT";

const refetch = mock(() => Promise.resolve());
const errorStates: { error: unknown; onRetry?: () => void }[] = [];

type BusinessesQuery = {
	data?: Array<{ id: string }>;
	isLoading: boolean;
	isError: boolean;
	error?: unknown;
	refetch: () => Promise<unknown>;
};

let businesses: BusinessesQuery;

const wrapper = ({ children }: { children?: ReactNode }) =>
	createElement(nativeWeb.View, null, children);
const empty = () => null;

mockNativeUi({
	FlatList: empty,
	ScrollView: wrapper,
	ActivityIndicator: empty,
});

mock.module("expo-router", () => ({
	router: { replace: () => {}, push: () => {} },
	useLocalSearchParams: () => ({}),
}));
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light }),
}));
mock.module("@/src/features/auth/store", () => ({
	useAuthStore: () => ({ id: "owner-1" }),
}));
mock.module("@/src/core/ui", () => ({
	AppText: nativeWeb.Text,
	Text: nativeWeb.Text,
	Screen: wrapper,
	ScreenHeader: () => null,
	FilterChip: empty,
	SearchBar: empty,
	EmptyState: empty,
	useWebPullToRefresh: () => ({ ref: undefined, indicator: null }),
	ErrorState: (props: { error: unknown; onRetry?: () => void }) => {
		errorStates.push(props);
		return createElement(nativeWeb.Text, null, ERROR_STATE);
	},
}));
mock.module("@/src/components/ui/skeleton", () => ({ Skeleton: empty }));
mock.module("@/src/components/ui/button", () => ({ Button: empty }));
mock.module("@/src/components/ui/text", () => ({ Text: nativeWeb.Text }));
mock.module("@/src/features/business/components/NoBusinessPrompt", () => ({
	NoBusinessPrompt: () => createElement(nativeWeb.Text, null, EMPTY_STATE),
}));
mock.module(
	"@/src/features/business/components/management/GestionContent",
	() => ({
		GestionContent: empty,
		GestionContentSkeleton: empty,
	}),
);
mock.module("@/src/features/business/components/BusinessForm", () => ({
	BusinessForm: empty,
}));
for (const module of [
	"BranchSelector",
	"BusinessStatsRow",
	"ProductsSortControl",
	"ProductFilters",
	"ProductCard",
]) {
	mock.module(`@/src/features/business/components/products/${module}`, () => ({
		BranchSelector: empty,
		BusinessStatsRow: empty,
		BusinessStatsRowSkeleton: empty,
		ProductsSortControl: empty,
		ProductFilters: empty,
		ProductCard: empty,
		ProductCardSkeleton: empty,
	}));
}
mock.module("@/src/features/hooks", () => ({
	useCategories: () => ({ data: [] }),
}));
mock.module("@/src/features/business/hooks", () => ({
	useBusinesses: () => businesses,
	useCreateBusiness: () => ({ mutate: () => {}, isPending: false }),
	useBusinessLocations: () => ({ data: [] }),
	useBusinessOfferCount: () => ({ data: 0 }),
	useBusinessOffers: () => ({
		data: { pages: [[]] },
		isLoading: false,
		isError: false,
		error: null,
		refetch,
		isFetching: false,
		fetchNextPage: () => {},
		hasNextPage: false,
		isFetchingNextPage: false,
	}),
}));

const { default: ProductsScreen } = await import(
	"../../../../app/(business)/products"
);
const { default: ManagementScreen } = await import(
	"../../../../app/(business)/management"
);
const { default: BusinessNewScreen } = await import(
	"../../../../app/my-business/business-new"
);

// business-new has no empty state: an owner without businesses lands on the
// creation form, which is the correct reading of an empty (not failed) list.
const SCREENS = [
	["products", ProductsScreen, true],
	["management", ManagementScreen, true],
	["business-new", BusinessNewScreen, false],
] as const;

beforeEach(() => {
	errorStates.length = 0;
	refetch.mockClear();
	businesses = {
		data: undefined,
		isLoading: false,
		isError: true,
		error: { code: "42501", message: "permission denied for table businesses" },
		refetch,
	};
});

for (const [name, Screen, showsEmptyState] of SCREENS) {
	test(`${name}: a failed businesses query renders the error state, never the empty state`, () => {
		const html = renderToStaticMarkup(createElement(Screen));

		expect(html).toContain(ERROR_STATE);
		expect(html).not.toContain(EMPTY_STATE);
		expect(html).not.toContain("No tienes negocios registrados");
		// The raw driver message must not reach the user either.
		expect(html).not.toContain("permission denied");
		expect(errorStates).toHaveLength(1);
		expect(errorStates[0]?.error).toBe(businesses.error);

		errorStates[0]?.onRetry?.();
		expect(refetch).toHaveBeenCalledTimes(1);
	});

	test(`${name}: a genuinely empty result is not read as a failure`, () => {
		businesses = {
			data: [],
			isLoading: false,
			isError: false,
			refetch,
		};

		const html = renderToStaticMarkup(createElement(Screen));

		expect(html).not.toContain(ERROR_STATE);
		if (showsEmptyState) expect(html).toContain(EMPTY_STATE);
	});
}
