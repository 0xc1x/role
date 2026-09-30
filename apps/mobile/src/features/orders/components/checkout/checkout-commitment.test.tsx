import { expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom has no declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";

import { strings } from "@/src/core/i18n/strings";
import { light } from "@/src/core/theme/colors";
import { formatRelativeDay, formatTime } from "@/src/core/utils/formatters";

/**
 * M15/M16: el momento del compromiso.
 *
 * Antes, el checkout tenía un botón deshabilitado sin etiqueta cambiada y una
 * línea de 11px que decía "Términos y condiciones aplicados" sin enlace ni
 * regla alguna. Aquí se fija el contrato: reason visible + enlace real.
 */

const pushed: string[] = [];
const linkPresses: Array<() => void> = [];
const buttons: Array<{
	label?: string;
	disabled?: boolean;
	onPress?: () => void;
}> = [];

const CANCELLATION_CONFIG: Record<string, number> = {
	"cancellation.window_minutes": 10,
	"cancellation.max_per_7d": 3,
	"cancellation.max_per_30d": 10,
};

type OfferState = "available" | "sold_out" | "expired" | "paused";
let offerState: OfferState = "available";

function offerDetail() {
	const base = {
		id: "offer-1",
		title: "Pack sorpresa",
		original_price: 1000,
		discounted_price: 500,
		stock: 3,
		is_active: true,
		pickup_start: "2099-01-01T10:00:00.000Z",
		pickup_end: "2099-01-01T22:00:00.000Z",
	};
	const states: Record<OfferState, typeof base> = {
		available: base,
		sold_out: { ...base, stock: 0 },
		expired: { ...base, pickup_end: "2000-01-01T22:00:00.000Z" },
		paused: { ...base, is_active: false },
	};
	return {
		offer: states[offerState],
		business: {
			id: "b-1",
			name: "Panadería",
			type: "restaurant",
			image: null,
			rating: 4.5,
			review_count: 3,
		},
		location: {
			id: "l-1",
			name: "Sucursal",
			address: "Av. Siempre Viva 742",
			latitude: -0.22,
			longitude: -78.52,
			zone: "Quito",
		},
		categories: [],
	};
}

mock.module("react-native", () => ({
	...nativeWeb,
	Pressable: (props: {
		children?: ReactNode;
		onPress?: () => void;
		accessibilityRole?: string;
	}) => {
		if (props.accessibilityRole === "link" && props.onPress) {
			linkPresses.push(props.onPress);
		}
		return createElement(nativeWeb.View, null, props.children);
	},
}));
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light }),
}));
mock.module("@/src/core/ui", () => ({
	AppText: nativeWeb.Text,
	LoadingView: () => createElement(nativeWeb.Text, null, "LOADING"),
	ErrorState: () => createElement(nativeWeb.Text, null, "ERROR"),
	Screen: ({ children }: { children?: ReactNode }) =>
		createElement(nativeWeb.View, null, children),
	ScreenHeader: () => null,
	// The screens under test are not the subject; keep them inert.
	goBackOr: () => {},
}));
mock.module("@/src/features/config", () => ({
	useConfigValue: (key: string, fallback: number) =>
		CANCELLATION_CONFIG[key] ?? fallback,
}));
mock.module("expo-router", () => ({
	router: { push: (path: string) => pushed.push(path) },
	useLocalSearchParams: () => ({ id: "offer-1" }),
}));
mock.module("sonner-native", () => ({
	toast: { success: () => {}, error: () => {} },
}));
mock.module("@/components/ui/button", () => ({
	Button: (props: {
		children?: ReactNode;
		disabled?: boolean;
		onPress?: () => void;
		loading?: boolean;
	}) => {
		const label = flatten(props.children);
		buttons.push({ label, disabled: props.disabled, onPress: props.onPress });
		return createElement(
			nativeWeb.View,
			null,
			createElement(nativeWeb.Text, null, label ?? ""),
		);
	},
}));
mock.module("@/src/features/orders/components/checkout", () => ({
	CouponSection: () => null,
	PaymentMethodSection: () => null,
	PickupDetailsCard: () => null,
	PriceBreakdownCard: () => null,
	ProductSummaryCard: () => null,
	ConfirmationView: () => null,
}));
mock.module("@/src/features/hooks", () => ({
	useOffer: () => ({
		data: offerDetail(),
		isLoading: false,
		isError: false,
		error: null,
		refetch: () => Promise.resolve(),
	}),
	useApplyCoupon: () => ({
		couponInput: "",
		couponError: null,
		appliedCoupon: null,
		applying: false,
		total: 500,
		applyCoupon: async () => {},
		clearCoupon: () => {},
		changeInput: () => {},
	}),
	useReserveOffer: () => ({ mutate: () => {}, isPending: false }),
	createReservationIdempotencyKey: () => "key",
}));

function flatten(node: ReactNode): string | undefined {
	if (typeof node === "string") return node;
	if (Array.isArray(node)) return node.map(flatten).join("");
	if (node && typeof node === "object" && "props" in node) {
		return flatten(
			(node as { props: { children?: ReactNode } }).props.children,
		);
	}
	return undefined;
}

const { default: CheckoutScreen } = await import(
	"../../../../../app/checkout/[id]"
);

function renderCheckout() {
	pushed.length = 0;
	linkPresses.length = 0;
	buttons.length = 0;
	return renderToStaticMarkup(createElement(CheckoutScreen));
}

const confirmButton = () =>
	buttons.find((b) =>
		[b.label].some(
			(label) =>
				label === strings.checkout.confirm ||
				label === strings.checkout.confirmUnavailable,
		),
	);

test("an available offer keeps the confirm label and states no reason", () => {
	offerState = "available";
	const html = renderCheckout();

	expect(confirmButton()?.label).toBe(strings.checkout.confirm);
	expect(confirmButton()?.disabled).toBe(false);
	expect(html).not.toContain(strings.checkout.reasonSoldOut);
	expect(html).not.toContain(strings.checkout.reasonWindowClosed);
	expect(html).not.toContain(strings.checkout.reasonPaused);
});

test("a sold-out offer disables the button and says why", () => {
	offerState = "sold_out";
	const html = renderCheckout();

	expect(confirmButton()?.label).toBe(strings.checkout.confirmUnavailable);
	expect(confirmButton()?.disabled).toBe(true);
	expect(html).toContain(strings.checkout.reasonSoldOut);
});

test("an offer past its pickup window says the window closed", () => {
	offerState = "expired";
	const html = renderCheckout();

	expect(confirmButton()?.disabled).toBe(true);
	expect(html).toContain(strings.checkout.reasonWindowClosed);
});

test("a paused offer says the business paused it", () => {
	offerState = "paused";
	const html = renderCheckout();

	expect(confirmButton()?.disabled).toBe(true);
	expect(html).toContain(strings.checkout.reasonPaused);
});

test("the terms line links to the legal route and quotes the real rules", () => {
	offerState = "available";
	const html = renderCheckout();

	// The claim the screen used to make without a link is gone.
	expect(html).not.toContain("Términos y condiciones aplicados.");
	expect(html).toContain(strings.checkout.termsLink);
	// A real link target, not a dead <Text>.
	expect(linkPresses).toHaveLength(1);
	linkPresses[0]?.();
	expect(pushed).toEqual(["/(consumer)/profile/terms"]);

	// Rules come from app_config, so the numbers are the configured ones.
	const [cancelRule, limitRule, pickupRule, paymentRule] =
		strings.checkout.termsRules;
	const { offer } = offerDetail();
	const window = strings.checkout.pickupWindow
		.replace("{day}", formatRelativeDay(offer.pickup_start))
		.replace("{start}", formatTime(offer.pickup_start))
		.replace("{end}", formatTime(offer.pickup_end));

	expect(cancelRule.replace("{minutes}", "10")).toContain("10 minutos");
	expect(limitRule.replace("{max7d}", "3").replace("{max30d}", "10")).toContain(
		"3 veces en 7 días",
	);
	expect(pickupRule.replace("{window}", window)).toBe(
		`Recoge dentro de la ventana indicada (${window}). Pasada la ventana, la reserva se libera.`,
	);
	expect(paymentRule).toContain("el local");

	for (const rendered of [
		strings.checkout.termsRulesTitle,
		`· ${cancelRule.replace("{minutes}", "10")}`,
		`· ${limitRule.replace("{max7d}", "3").replace("{max30d}", "10")}`,
		`· ${pickupRule.replace("{window}", window)}`,
		`· ${paymentRule}`,
	]) {
		expect(html).toContain(rendered);
	}
});
