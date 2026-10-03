import { expect, mock, test } from "bun:test";
import { createElement } from "react";
// @ts-expect-error react-dom is installed without @types/react-dom in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { authorPalette, light } from "@/src/core/theme/colors";
import { authorDisc } from "@/src/core/utils/author-palette";
import { mockNativeUi } from "@/src/test-utils/native-mocks";
import type { UserProfile } from "@/src/features/auth/domain/user";

/**
 * The author disc is painted in three places: the review list, the profile
 * header and the edit-profile form. What matters is not that a colour appears
 * but WHICH one — a disc that quietly fell back to a theme default would pass
 * every "is there a background" assertion while showing nobody a stable
 * identity. So these read the actual rendered colours and compare them against
 * the pair the palette says that profile's id resolves to.
 *
 * They also pin the rule that the colour is for the NO-PHOTO case: with an
 * `avatarUrl` the image covers the fill, so the pair must not be painted at
 * all — otherwise a user's photo picks up a tint.
 */

mockNativeUi();
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
mock.module("@rn-primitives/portal", () => ({ Portal: nativeWeb.View }));
mock.module("@rn-primitives/avatar", () => ({
	Root: nativeWeb.View,
	Image: nativeWeb.View,
	Fallback: nativeWeb.View,
}));
mock.module("expo-image", () => ({ Image: nativeWeb.View }));
mock.module("expo-router", () => ({
	router: { push: () => {}, replace: () => {}, back: () => {} },
	useSegments: () => [],
	useNavigation: () => ({ setOptions: () => {} }),
}));
mock.module("@/src/features/profile/hooks", () => ({
	useProfileStats: () => ({ data: undefined, isLoading: false }),
}));
mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light, scheme: "light" }),
}));

const { ProfileAvatar } = await import(
	"@/src/features/profile/components/ProfileHeader"
);

function profile(over: Partial<UserProfile> = {}): UserProfile {
	return {
		id: "3f1a2b4c-0000-4000-8000-000000000001",
		email: "ana@correo.com",
		fullName: "Ana López",
		avatarUrl: null,
		phone: null,
		city: null,
		role: "user",
		analyticsConsentGranted: false,
		...over,
	};
}

const SEED = profile().id;

/**
 * react-native-web serialises colours as `rgba(r,g,b,a)`, never as the hex the
 * palette stores, so these assert on the RGB triple rather than the source
 * string. Comparing hexes against the markup would pass vacuously — the hex is
 * simply not there.
 */
function rgbOf(hex: string): string {
	const value = hex.replace("#", "");
	const [r, g, b] = [0, 2, 4].map((o) => parseInt(value.slice(o, o + 2), 16));
	return `rgba(${r},${g},${b},`;
}

test("the disc is painted with the pair the palette resolves for that id", () => {
	const html = renderToStaticMarkup(
		createElement(ProfileAvatar, { profile: profile() }),
	);
	const { fill, on } = authorDisc("light", SEED);
	expect(html).toContain(rgbOf(fill));
	expect(html).toContain(rgbOf(on));
});

test("two renders of the same id are byte-identical", () => {
	const first = renderToStaticMarkup(
		createElement(ProfileAvatar, { profile: profile() }),
	);
	const second = renderToStaticMarkup(
		createElement(ProfileAvatar, { profile: profile() }),
	);
	expect(second).toBe(first);
});

test("a different id paints a different fill", () => {
	const other = "9c8d7e6f-1111-4000-8000-000000000002";
	const a = authorDisc("light", SEED);
	const b = authorDisc("light", other);
	// The palette has 16 entries, so two ids usually differ; when this pair
	// happens to collide the modulo does its job and there is nothing to
	// assert about the rendering beyond the shared fill.
	if (a.fill === b.fill) return;
	const html = renderToStaticMarkup(
		createElement(ProfileAvatar, { profile: profile({ id: other }) }),
	);
	expect(html).toContain(rgbOf(b.fill));
	expect(html).not.toContain(rgbOf(a.fill));
});

test("with a photo the pair is not painted at all", () => {
	const { fill, on } = authorDisc("light", SEED);
	const html = renderToStaticMarkup(
		createElement(ProfileAvatar, {
			profile: profile({ avatarUrl: "https://cdn.test/a.png" }),
		}),
	);
	expect(html).not.toContain(rgbOf(fill));
	expect(html).not.toContain(rgbOf(on));
});

test("the initials fall back to the first letter when there is no name", () => {
	const html = renderToStaticMarkup(
		createElement(ProfileAvatar, { profile: profile({ fullName: null }) }),
	);
	expect(html).toContain("F");
});

test("both schemes resolve a pair, and the dark one differs from light", () => {
	const light_ = authorDisc("light", SEED);
	const dark_ = authorDisc("dark", SEED);
	expect(light_.fill).toMatch(/^#[0-9A-F]{6}$/);
	expect(dark_.fill).toMatch(/^#[0-9A-F]{6}$/);
	expect(dark_.fill).not.toBe(light_.fill);
});

test("every palette entry in both schemes carries a foreground", () => {
	for (const scheme of ["light", "dark"] as const) {
		for (const entry of authorPalette[scheme]) {
			expect(entry.on).toMatch(/^#[0-9A-F]{6}$/);
		}
	}
});
