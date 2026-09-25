import { expect, mock, test } from "bun:test";
import { createElement } from "react";
// @ts-expect-error react-dom is installed without @types/react-dom in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// React Native Web is the installed renderer; no DOM emulation is needed for SSR.
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { light, dark } from "@/src/core/theme/colors";
import type { OfferDetail } from "@/src/features/offers/domain/offer";

let colors = light;
mock.module("react-native", () => nativeWeb);
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
mock.module("expo-router", () => ({ router: { push: () => {} } }));
mock.module("expo-image", () => ({ Image: nativeWeb.View }));
mock.module("@/src/core/theme", () => ({ useTheme: () => ({ colors }) }));
mock.module("@/src/features/business/hooks", () => ({
	useDeleteOffer: () => ({ mutate: () => {} }),
	useToggleOfferActive: () => ({ mutate: () => {} }),
}));
const { AppText } = await import("@/src/core/ui/AppText");
mock.module("@/src/core/ui", () => ({
	AppText,
	StatusBadge: ({ label }: { label: string }) =>
		createElement(AppText, null, label),
	BottomSheetModal: () => null,
}));
mock.module("@/components/ui/alert-dialog", () =>
	Object.fromEntries(
		[
			"AlertDialog",
			"AlertDialogAction",
			"AlertDialogCancel",
			"AlertDialogContent",
			"AlertDialogDescription",
			"AlertDialogFooter",
			"AlertDialogHeader",
			"AlertDialogTitle",
		].map((name) => [name, () => null]),
	),
);
const { ProductCard, ProductCardSkeleton } = await import("./ProductCard");

const product: OfferDetail = {
	offer: {
		id: "offer-1",
		business_id: "business-1",
		business_location_id: "branch-1",
		title: "Artisan bread selection for collection",
		description: null,
		image: null,
		category_ids: [],
		original_price: 150,
		discounted_price: 65,
		discount_percentage: null,
		stock: 0,
		initial_stock: 8,
		pickup_start: "2026-09-06T15:00:00",
		pickup_end: "2026-09-06T18:00:00",
		is_active: true,
		includes: null,
		allergens: null,
		rating: 0,
		review_count: 0,
		created_at: "2026-09-01T12:00:00",
		updated_at: "2026-09-01T12:00:00",
	},
	business: {
		id: "business-1",
		name: "Bakery",
		type: "bakery",
		image: null,
		rating: 0,
		review_count: 0,
	},
	location: {
		id: "branch-1",
		name: "Historic city centre collection branch",
		address: "Centre",
		latitude: 0,
		longitude: 0,
		zone: null,
	},
	categories: [],
};

test("renders metadata and independent footer buttons in both themes, including zero stock", () => {
	for (const palette of [light, dark]) {
		colors = palette;
		const html = renderToStaticMarkup(
			createElement(ProductCard, { businessId: "business-1", product }),
		);
		const buttons = [
			...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g),
		].map((match) => match[1]!);
		expect(buttons).toHaveLength(4);
		expect(buttons.every((body) => !body.includes("<button"))).toBe(true);
		expect(buttons[0]).toContain("Activo");
		expect(buttons[0]).toContain("8 vendidos");
		expect(buttons[0]).toContain(product.location!.name);
		expect(buttons[0]).toContain("Hasta dom 6 sep");
		expect(buttons[0]).toContain(">0</div>");
		expect(buttons[1]).toContain("Ver detalles");
		expect(buttons[2]).toContain("Editar");
		expect(buttons[3]).toContain("Más acciones");
		expect(
			renderToStaticMarkup(createElement(ProductCardSkeleton)),
		).not.toBeEmpty();
	}
	const inactive = {
		...product,
		offer: { ...product.offer, is_active: false, initial_stock: 0 },
	};
	const html = renderToStaticMarkup(
		createElement(ProductCard, { businessId: "business-1", product: inactive }),
	);
	expect(html).toContain("Inactivo");
	expect(html).not.toContain("vendidos");
});
