import { beforeEach, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without @types/react-dom here.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { light } from "@/src/core/theme/colors";
import { strings } from "@/src/core/i18n/strings";
import { mockNativeUi } from "@/src/test-utils/native-mocks";

// El "ver todas" del perfil de un negocio solo puede existir si hay una oferta
// más que las que se ven. La regla es del slider, no de la pantalla que lo
// monta: por eso se afirma acá y no en el perfil.

type SectionQuery = {
	data?: unknown[];
	isLoading: boolean;
	isError: boolean;
	refetch: () => Promise<unknown>;
};

/** Cada `OfferCard` pintado deja su id en el HTML, para poder contarlos. */
let businessQuery: SectionQuery = {
	data: [],
	isLoading: false,
	isError: false,
	refetch: async () => undefined,
};
let seeAll: (() => void) | undefined;

mockNativeUi({
	ScrollView: ({ children }: { children?: ReactNode }) => children as never,
	// `FlatList` tiene que DESPINTAR los items: con el FlatList real de
	// react-native el SSR no renderiza nada, el conteo de tarjetas da cero en
	// todos los casos, y la única aserción que sobrevive es la del link — que
	// pasa en falso cuando la lista entera está vacía sin querer.
	FlatList: ({
		data,
		renderItem,
	}: {
		data: unknown[];
		renderItem: (info: { item: unknown }) => ReactNode;
	}) =>
		createElement(
			nativeWeb.View,
			null,
			...(data as unknown[]).map((item) => renderItem({ item }) as ReactNode),
		) as never,
});

mock.module("expo-router", () => ({ router: { push: mock(() => {}) } }));
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light, scheme: "light" }),
}));
mock.module("@/src/core/ui", () => ({
	AppText: nativeWeb.Text,
	Card: ({ children }: { children?: ReactNode }) => children as never,
	ErrorState: () => null,
	// El link no se dibuja: se registra. Dos `Href` distintos no se distinguen
	// en el HTML, así que lo que se afirma es si el header RECIBIÓ el gesto.
	SectionHeader: (props: { onSeeAll?: () => void }) => {
		seeAll = props.onSeeAll;
		return null;
	},
}));
mock.module("@/src/features/offers/components/OfferCard", () => ({
	// `OfferRowItem` pasa el `OfferDetail` entero como prop `offer`, así que la
	// fila real se despinta desde `offer.offer` — el doble `offer` es de la
	// firma de `OfferCard`, no un error de la prueba.
	OfferCard: ({ offer }: { offer: { offer: { id: string } } }) =>
		createElement(nativeWeb.Text, null, `card-${offer.offer.id}`),
}));
mock.module("@/src/features/hooks", () => ({
	usePopularOffers: () => businessQuery,
	useExpiringSoonOffers: () => businessQuery,
	useRecentOffers: () => businessQuery,
	useNearbyOffersHook: () => businessQuery,
	useBusinessOffersRow: () => businessQuery,
	useSelectedAddress: () => null,
}));

const { OfferRowSection } = await import("./OfferRowSection");

/** `total` ofertas con id estable; la sexta es la que decide el link. */
function offers(total: number) {
	return Array.from({ length: total }, (_, i) => ({
		offer: { id: `o-${i + 1}` },
		business: { name: "Panadería" },
		location: null,
		categories: [],
	}));
}

function renderBusinessRow(total: number, onSeeAll: () => void): string {
	businessQuery = {
		data: offers(total),
		isLoading: false,
		isError: false,
		refetch: async () => undefined,
	};
	return renderToStaticMarkup(
		createElement(OfferRowSection, {
			type: "business",
			title: strings.businessProfile.offersTitle,
			businessId: "business-1",
			limit: 6,
			maxVisible: 5,
			onSeeAll,
		}),
	);
}

beforeEach(() => {
	seeAll = undefined;
});

test("con una sexta oferta el link existe y se ven cinco", () => {
	const onSeeAll = () => {};
	const html = renderBusinessRow(6, onSeeAll);

	// Cinco pintadas, no seis: la sexta existe para responder, no para mostrarse.
	expect(html.match(/card-o-/g)).toHaveLength(5);
	expect(html).not.toContain("card-o-6");
	expect(seeAll).toBeDefined();
});

test("sin sexta oferta el link no se ofrece", () => {
	renderBusinessRow(5, () => {});
	// Ofrecer "ver todas" sobre cinco es un callejón sin salida: el listado de
	// destino tendría exactamente lo mismo que ya está en pantalla.
	expect(seeAll).toBeUndefined();
});

test("con menos de cinco tampoco hay link, y se ven todas", () => {
	const html = renderBusinessRow(3, () => {});
	expect(html.match(/card-o-/g)).toHaveLength(3);
	expect(seeAll).toBeUndefined();
});

test("sin maxVisible la fila no corta nada", () => {
	// Las cuatro secciones de la home piden diez y quieren ver diez: el corte
	// solo existe donde la pantalla lo pidió explícitamente.
	businessQuery = {
		data: offers(10),
		isLoading: false,
		isError: false,
		refetch: async () => undefined,
	};
	const html = renderToStaticMarkup(
		createElement(OfferRowSection, {
			type: "recent",
			title: strings.home.recienAgregados,
			limit: 10,
			onSeeAll: () => {},
		}),
	);
	expect(html.match(/card-o-/g)).toHaveLength(10);
	expect(seeAll).toBeDefined();
});
