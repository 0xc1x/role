import { expect, mock, test } from "bun:test";
import { plugin } from "bun";
import { createElement } from "react";
// @ts-expect-error react-dom is installed without declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { light } from "@/src/core/theme/colors";
import { strings } from "@/src/core/i18n/strings";
import { mockNativeUi } from "@/src/test-utils/native-mocks";
import type {
	Business,
	BusinessProfileDetail,
} from "@/src/features/business/domain/business";

// These primitives ship JSX in .mjs; Metro handles that in the app and bun's
// transpiler cannot parse it. Same loader shim as `SegmentedTabs.test.tsx` and
// `report-problem-trigger.test.tsx`.
plugin({
	name: "primitives-jsx",
	setup(build) {
		build.onLoad(
			{ filter: /@rn-primitives[+/][^/]+[+/]dist[+/].*\.mjs$/ },
			async ({ path }) => ({
				contents: await Bun.file(path).text(),
				loader: "jsx",
			}),
		);
	},
});

/**
 * Las tres cards plegables del perfil de un negocio y su estado inicial.
 *
 * Contacto se pliega pero ABRE. Horarios y reseñas se pliegan y arrancan
 * CERRADOS. La asimetría es lo que se afirma acá: el estado inicial es
 * xml`defaultValue` de cada `Accordion`, y un `defaultValue` mal puesto abre
 * una card entera de golpe — con el mapa adentro, el hueco en pantalla es de
 * 180px más— sin que ningún test lo note si solo se mira que compile.
 *
 * Lo que NO se afirma es que se pliegue: eso es comportamiento del primitive y
 * ya lo cubre el arnés del accordion. Reimplementar el pliegue acá probaría la
 * librería, no la pantalla.
 */

mockNativeUi();

/**
 * `src/core/theme/index.tsx` importa `expo-system-ui`, que llega a
 * `expo-modules-core` y lee `globalThis.expo` al momento de importarse: en bun
 * eso es un `TypeError` antes de que corra un solo test. Se stubea el hook y se
 * fija el esquema en claro —los tokens de color son los mismos que usa la
 * pantalla, y lo que se afirma acá es qué filas se pintan, no qué tono.
 *
 * Mismo stub que `semantic-text.render.test.tsx`.
 */
mock.module("@/src/core/theme", () => ({
	useTheme: () => ({
		colors: light,
		scheme: "light",
		mode: "light",
		setMode: () => {},
	}),
	ThemeProvider: () => null,
	light,
	dark: light,
}));

/**
 * Los mapas no son parte de este contrato y arrastran `react-native-maps`.
 * Se stubea con un texto adentro para poder afirmar que el mapa aparece o no: un
 * stub que devuelve `null` haría indistinguibles "sin coordenadas" de "con
 * coordenadas pero roto", que es justo la regresión a evitar.
 */
mock.module("@/src/features/business/components/BusinessLocationMap", () => ({
	BusinessLocationMap: () => createElement(nativeWeb.Text, null, "ELMAPA"),
}));
mock.module("expo-router", () => ({
	router: { push: () => {}, replace: () => {}, back: () => {} },
	useNavigation: () => ({ setOptions: () => {} }),
	useSegments: () => [],
	useLocalSearchParams: () => ({}),
}));

/**
 * `AccordionTrigger` pinta el chevron con `Icon`, que llama `cssInterop` de
 * `nativewind` al importar. El entrypoint de `nativewind` arrastra su
 * `doctor.js`, que bun no puede parsear. Se stubea el modulo entero en vez de
 * parchear `icon.tsx`: el chevron no es lo que estos tests afirman, y el
 * interop de nativewind tiene sus propios specs.
 */
mock.module("nativewind", () => ({ cssInterop: () => {} }));

/**
 * `accordion.tsx` usa `Animated.View`, `LinearTransition`, `FadeOutUp`,
 * `LayoutAnimationConfig` y `ReduceMotion` de reanimated. El modulo real entra a
 * `expo-modules-core`, que lee `globalThis.expo` en tiempo de import y revienta
 * en bun. Mismo stub que `semantic-text.render.test.tsx`: sin transiciones no se
 * puede comprobar nada, y lo que estos tests afirman es el estado inicial.
 */
mock.module("react-native-reanimated", () => ({
	__esModule: true,
	default: { View: nativeWeb.View, ScrollView: nativeWeb.ScrollView },
	Animated: { View: nativeWeb.View },
	useSharedValue: (value: unknown) => ({ value }),
	useAnimatedStyle: (fn: () => unknown) => fn(),
	useAnimatedRef: () => null,
	useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
	withTiming: (value: unknown) => value,
	withSpring: (value: unknown) => value,
	withRepeat: (value: unknown) => value,
	withSequence: (...values: unknown[]) => values[values.length - 1],
	cancelAnimation: () => {},
	interpolateColor: (value: unknown) => value,
	runOnJS: (fn: unknown) => fn,
	runOnUI: (fn: unknown) => fn,
	LinearTransition: { duration: () => ({}) },
	FadeOutUp: { duration: () => ({ reduceMotion: () => ({}) }) },
	LayoutAnimationConfig: ({ children }: { children?: unknown }) => children,
	ReduceMotion: { System: 0, Always: 1, Never: 2 },
	Easing: {
		ease: (v: number) => v,
		inOut: (fn: unknown) => fn,
		linear: (v: number) => v,
	},
}));

const { ContactInfoCard, HoursCard } = await import(
	"@/src/features/business/components/profile/ProfileContact"
);
const { ReviewsCard } = await import(
	"@/src/features/business/components/profile/ProfileSocial"
);

const business = {
	id: "business-1",
	name: "Panadería",
	email: "hola@panaderia.test",
	website: "panaderia.test",
	rating: 4.5,
	review_count: 12,
} as unknown as Business;

const profile = (
	over: Partial<BusinessProfileDetail> = {},
): BusinessProfileDetail => ({
	business,
	address: "Av. Siempre Viva 742",
	businessLocationId: "location-1",
	latitude: -0.1807,
	longitude: -78.4678,
	zone: "La Floresta",
	memberSince: "2025-01-01",
	totalRescued: 340,
	hours: [{ dayRange: "Lunes a viernes", hoursDisplay: "07:00 a 19:00" }],
	reviews: [
		{
			id: "review-1",
			authorId: "user-1",
			userName: "Ana",
			productRating: 5,
			businessRating: 4,
			date: "2026-09-01",
			comment: "Croissant amazing",
			orderId: "order-1",
			offerId: "offer-1",
			offerTitle: "Caja de croissants",
		},
	],
	...over,
});

test("contact opens by default, so the address and the map are there on arrival", () => {
	const html = renderToStaticMarkup(
		createElement(ContactInfoCard, { profile: profile() }),
	);

	// El cuerpo presente es la prueba del `defaultValue`: el `AccordionContent`
	// del primitive devuelve null cuando el item está cerrado, así que si estas
	// filas están en el HTML es que arrancó abierto.
	expect(html).toContain("Av. Siempre Viva 742");
	expect(html).toContain("hola@panaderia.test");
	expect(html).toContain("ELMAPA");
});

test("contact keeps the same rows it always had: address, phone, email, website", () => {
	// El pliegue no es una excusa para perder contenido. Si alguien saca una
	// fila al meter la card en un accordion, el desplegar la deja de mostrar y
	// este test lo dice — el pliegue se nota, la ausencia no.
	const html = renderToStaticMarkup(
		createElement(ContactInfoCard, { profile: profile() }),
	);

	expect(html).toContain(strings.businessProfile.address);
	expect(html).toContain(strings.businessProfile.directions);
	expect(html).toContain(strings.businessProfile.email);
	expect(html).toContain(strings.businessProfile.website);
});

test("contact without coordinates shows no map instead of an empty one", () => {
	const html = renderToStaticMarkup(
		createElement(ContactInfoCard, {
			profile: profile({ latitude: null, longitude: null }),
		}),
	);

	// Un mapa en blanco con el local en medio del océano es peor que nada.
	expect(html).not.toContain("ELMAPA");
	// Y la dirección sigue ahí: se perdió la geolocalización, no el contacto.
	expect(html).toContain("Av. Siempre Viva 742");
});

test("hours start collapsed", () => {
	const html = renderToStaticMarkup(
		createElement(HoursCard, { hours: profile().hours }),
	);

	// El título está siempre; las filas de horario, solo abierto.
	expect(html).toContain(strings.businessProfile.businessHours);
	expect(html).not.toContain("Lunes a viernes");
});

test("reviews start collapsed but the header carries rating and count", () => {
	const html = renderToStaticMarkup(
		createElement(ReviewsCard, { profile: profile() }),
	);

	expect(html).toContain(strings.businessProfile.reviewsTitle);
	expect(html).toContain("4.5");
	// El total en el header es lo que hace decidir si se abre. Si desaparece,
	// contraído no queda nada que indique que hay algo adentro.
	expect(html).toContain("(12)");
	// Y el cuerpo sigue oculto.
	expect(html).not.toContain("Croissant amazing");
});

test("reviews with no count at all still render their header", () => {
	const html = renderToStaticMarkup(
		createElement(ReviewsCard, {
			profile: profile({
				business: { ...business, review_count: 0 } as unknown as Business,
			}),
		}),
	);

	expect(html).toContain(strings.businessProfile.reviewsTitle);
	expect(html).not.toContain("(0)");
	expect(html).not.toContain("NaN");
});
