import { beforeEach, expect, it, mock } from "bun:test";
import { plugin } from "bun";
import { createElement, type ComponentType } from "react";
// @ts-expect-error react-dom is installed without declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { authorPalette, dark, light } from "@/src/core/theme/colors";
import { mockNativeUi } from "@/src/test-utils/native-mocks";
import type { UserProfile } from "@/src/features/auth/domain/user";

// El disco del avatar ES la identidad de la persona. `profiles` no tiene policy
// que deje leer el perfil de otro consumidor, así que el nombre no siempre
// distingue a nadie, y sin foto el fallback era un círculo neutro que no decía
// nada. El color se deriva del `user_id` —público y estable— con la misma
// paleta que ya usan los autores de reseñas: la misma persona es el mismo
// color en todos los dispositivos y para siempre.

// These primitives ship JSX in .mjs; Metro handles that in the app and bun's
// transpiler cannot parse it. Same loader shim as `SegmentedTabs.test.tsx`.
plugin({
	name: "avatar-jsx",
	setup(build) {
		build.onLoad(
			// Broad on purpose: the transitive graph of these primitives (slot,
			// portal, ...) reaches a sibling package that also ships raw JSX, and
			// enumerating them one failure at a time is how a test suite rots.
			{ filter: /@rn-primitives[+/][^/]+[+/]dist[+/].*\.mjs$/ },
			async ({ path }) => ({
				contents: await Bun.file(path).text(),
				loader: "jsx",
			}),
		);
	},
});

type ViewProps = { style?: unknown; role?: string };
const discs: ViewProps[] = [];

// The interop runtime requires `react-native` on import, so the native mock has
// to be registered first. The primitive paints its fallback on RN `View`;
// wrapping it is what makes the resolved style observable, the same way
// `stats-kpi.test.tsx` reads Card output.
let StyledView: ComponentType<ViewProps>;
mockNativeUi({
	View: (props: ViewProps) => createElement(StyledView, props),
});

const { cssInterop } = await import(
	"react-native-css-interop/dist/runtime/native/api"
);
StyledView = cssInterop(
	(props: ViewProps) => {
		discs.push(props);
		return createElement(nativeWeb.View, props);
	},
	{ className: "style" },
);

let scheme: "light" | "dark" = "light";
mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: scheme === "light" ? light : dark, scheme }),
}));
mock.module("@/src/features/profile/hooks", () => ({
	useProfileStats: () => ({ data: undefined, isLoading: false }),
}));
// `ProfileHeader` -> `hooks` -> auth store -> expo-router, whose splash module
// reads `globalThis.expo` at import time and whose real barrel drags in native
// modules. Nothing on the avatar path navigates, so a permissive proxy keeps
// bun's named-export check happy without reimplementing the router.
const noop = () => {};
mock.module("expo-router", () => ({
	__esModule: true,
	router: { replace: noop, push: noop, back: noop, navigate: noop },
	useRouter: () => ({ replace: noop, push: noop, back: noop }),
	useLocalSearchParams: () => ({}),
	useGlobalSearchParams: () => ({}),
	useSegments: () => [],
	usePathname: () => "/",
	useNavigation: () => ({ navigate: noop, replace: noop, goBack: noop }),
	Link: noop,
	Stack: noop,
	Tabs: noop,
	Redirect: noop,
}));

const { ProfileAvatar, ProfileHeader } = await import("./ProfileHeader");

/**
 * Expected colours are literals on purpose. Recomputing them with
 * `authorPaletteIndex` would run the same function the component runs, so the
 * expectation would agree with the code by construction and could never
 * disagree with it. These slots were worked out by hand from FNV-1a over each
 * seed and cross-checked against an independent BigInt implementation of the
 * hash; the palette itself is frozen, because reordering it would repaint
 * every author already on screen.
 */
const ANA = "3f9a1c2e-7b4d-4e8a-9c1f-2d6b5a0e7f31"; // slot 7
const BRUNO = "a1b2c3d4-e5f6-4708-9a1b-2c3d4e5f6071"; // slot 3
const ANA_LIGHT = "#B45309";
const ANA_DARK = "#FCD34D";
const BRUNO_LIGHT = "#C2410C";

function profileWith(id: string): UserProfile {
	return {
		id,
		email: "persona@role.app",
		fullName: "Ana Ruiz",
		avatarUrl: null,
		phone: null,
		city: "Quito",
		role: "user",
		analyticsConsentGranted: false,
	};
}

const flat = (props: ViewProps) =>
	nativeWeb.StyleSheet.flatten(props.style ?? {}) as Record<string, unknown>;

/** The fallback is the only node the primitive paints with `role="img"`. */
function discColor(): string {
	const fallback = discs.find((props) => props.role === "img");
	if (!fallback) throw new Error("el fallback no se pintó");
	return flat(fallback).backgroundColor as string;
}

function renderProfile(profile: UserProfile): void {
	discs.length = 0;
	renderToStaticMarkup(createElement(ProfileAvatar, { profile }));
}

beforeEach(() => {
	scheme = "light";
	discs.length = 0;
});

it("el perfil pinta el disco del color que le toca a ese user_id", () => {
	renderProfile(profileWith(ANA));
	expect(discColor()).toBe(ANA_LIGHT);
});

it("el mismo user_id da el mismo color siempre", () => {
	// Re-rendering is not the real risk; seeding from something that can move
	// (the name, the avatar URL) is. Same id, same disc, whatever else changed.
	for (const fullName of ["Ana Ruiz", "Ana", "", null]) {
		renderProfile({ ...profileWith(ANA), fullName });
		expect(discColor()).toBe(ANA_LIGHT);
	}
	renderProfile({
		...profileWith(ANA),
		avatarUrl: "https://cdn.invalid/a.png",
	});
	expect(discColor()).toBe(ANA_LIGHT);
});

it("dos user_id distintos dan colores distintos dentro de la paleta", () => {
	renderProfile(profileWith(ANA));
	const ana = discColor();
	renderProfile(profileWith(BRUNO));
	const bruno = discColor();

	expect(ana).not.toBe(bruno);
	// Distinct AND recognisably ours: a random colour clears the line above.
	const fills = authorPalette.light.map((entry) => entry.fill);
	expect(fills).toContain(ana);
	expect(fills).toContain(bruno);
	expect(ana).toBe(ANA_LIGHT);
	expect(bruno).toBe(BRUNO_LIGHT);
});

it("el color cambia con el esquema claro/oscuro", () => {
	renderProfile(profileWith(ANA));
	expect(discColor()).toBe(ANA_LIGHT);

	scheme = "dark";
	renderProfile(profileWith(ANA));
	// Dark is not the light palette darkened: it carries lighter fills, because
	// the light ones vanish against a dark surface.
	expect(discColor()).toBe(ANA_DARK);
	expect(discColor()).not.toBe(ANA_LIGHT);
});

it("el header del perfil pinta el mismo disco que el avatar suelto", () => {
	// The header is the surface a person actually looks at: ProfileAvatar could
	// be painted correctly while the header kept a neutral circle.
	discs.length = 0;
	renderToStaticMarkup(
		createElement(ProfileHeader, { profile: profileWith(ANA) }),
	);
	expect(discColor()).toBe(ANA_LIGHT);
});

it("el color es el mismo para una persona con rol de negocio", () => {
	// "De cualquier tipo": the seed is the `user_id`, so a business owner is
	// the same person and lands on the same slot as everywhere else.
	renderProfile({ ...profileWith(ANA), role: "business" });
	expect(discColor()).toBe(ANA_LIGHT);

	renderProfile({ ...profileWith(BRUNO), role: "business" });
	expect(discColor()).toBe(BRUNO_LIGHT);
});
