import { beforeEach, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without @types/react-dom in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { light } from "@/src/core/theme/colors";
import { mockNativeUi } from "@/src/test-utils/native-mocks";

// A guest pressing the heart must get a real next step (the login screen),
// never a "Sesión requerida" error or the generic "Algo salió mal" toast.

const push = mock((_href: unknown) => {});
const mutate = mock((_offerId: string) => {});
const wrapper = ({ children }: { children?: ReactNode }) =>
	createElement(nativeWeb.View, null, children);
const empty = () => null;

let profile: { id: string } | null = null;
let heroProps: { onToggleFavorite: () => void } | null = null;

mockNativeUi();
mock.module("expo-router", () => ({
	router: { push, replace: () => {}, back: () => {} },
	useLocalSearchParams: () => ({ id: "of-1" }),
}));
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light }),
}));
mock.module("@/src/core/ui", () => ({
	AppText: nativeWeb.Text,
	Screen: wrapper,
	ScreenHeader: () => null,
	EmptyState: empty,
	CircleIconButton: empty,
	FilterChip: empty,
	SearchBar: empty,
	goBackOr: () => {},
	useWebPullToRefresh: () => ({ ref: undefined, indicator: null }),
	ErrorState: () => null,
}));
mock.module("@/src/components/ui/skeleton", () => ({ Skeleton: empty }));
mock.module("@/src/components/ui/button", () => ({ Button: empty }));
mock.module("@/src/components/ui/text", () => ({ Text: nativeWeb.Text }));
mock.module("@/src/components/ui/card", () => ({
	Card: wrapper,
	CardContent: wrapper,
	CardHeader: wrapper,
	CardTitle: wrapper,
	CardFooter: wrapper,
}));
mock.module("@/src/features/auth/store", () => ({
	useAuthStore: () => profile,
}));
mock.module("@/src/features/offers/components/detail/OfferContent", () => ({
	OfferContent: empty,
}));
mock.module("@/src/features/offers/components/detail/OfferBottomBar", () => ({
	OfferBottomBar: empty,
}));
mock.module("@/src/features/offers/components/detail/OfferHero", () => ({
	OfferHero: (props: { onToggleFavorite: () => void }) => {
		heroProps = props;
		return null;
	},
}));
mock.module("@/src/features/hooks", () => ({
	useOffer: () => ({
		data: {
			offer: {
				id: "of-1",
				business_id: "biz-1",
				business_location_id: "loc-1",
				title: "Mañana",
				description: null,
				image: null,
				category_ids: [],
				original_price: 10,
				discounted_price: 4,
				discount_percentage: null,
				stock: 5,
				initial_stock: 5,
				pickup_start: "2026-09-25T18:00:00.000Z",
				pickup_end: "2026-09-25T22:00:00.000Z",
				is_active: true,
				includes: null,
				allergens: null,
				rating: 4,
				review_count: 2,
				created_at: "2026-09-25T00:00:00.000Z",
				updated_at: "",
			},
			business: {
				id: "biz-1",
				name: "Panadería",
				type: "bakery",
				image: null,
				rating: 4,
				review_count: 2,
			},
			location: null,
			categories: [],
		},
		isLoading: false,
		isError: false,
		error: null,
		refetch: () => Promise.resolve(),
		isFetching: false,
	}),
	useIsFavorite: () => false,
	useToggleFavorite: () => ({ mutate, isPending: false }),
}));

const { default: OfferDetailScreen } = await import(
	"../../../../../app/offer/[id]"
);

beforeEach(() => {
	push.mockClear();
	mutate.mockClear();
	heroProps = null;
	profile = null;
});

test("a guest pressing the heart is routed to login, not into a failing mutation", () => {
	renderToStaticMarkup(createElement(OfferDetailScreen));
	heroProps?.onToggleFavorite();

	expect(push).toHaveBeenCalledWith("/login");
	// No mutation ran: no error toast, no "Algo salió mal", no failed request.
	expect(mutate).not.toHaveBeenCalled();
});

test("an authenticated owner still toggles the favorite", () => {
	profile = { id: "consumer-1" };
	renderToStaticMarkup(createElement(OfferDetailScreen));
	heroProps?.onToggleFavorite();

	expect(mutate).toHaveBeenCalledWith("of-1");
	expect(push).not.toHaveBeenCalled();
});
