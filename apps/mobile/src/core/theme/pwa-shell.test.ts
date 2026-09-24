import { readFileSync } from "node:fs";
import { describe, expect, mock, test } from "bun:test";

mock.module("react-native", () => ({
	Platform: { OS: "web" },
}));

const {
	IOS_PWA_NAVBAR_OVERLAP,
	getIosPwaNavbarOverlap,
} = await import("../ios-pwa-navbar");

const shell = readFileSync(
	new URL("../../../public/index.html", import.meta.url),
	"utf8",
);
const themeSource = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");
const consumerLayoutSource = readFileSync(
	new URL("../../../app/(consumer)/_layout.tsx", import.meta.url),
	"utf8",
);
const businessLayoutSource = readFileSync(
	new URL("../../../app/(business)/_layout.tsx", import.meta.url),
	"utf8",
);
const navbarSource = readFileSync(
	new URL("../ui/Navbar.tsx", import.meta.url),
	"utf8",
);

function htmlDocument(iosStandalone?: string) {
	return {
		documentElement: {
			dataset: { iosStandalone },
		},
	};
}

describe("PWA web shell", () => {
	test("paints a themed light/dark canvas before hydration", () => {
		expect(shell).toMatch(
			/:root\s*\{\s*--page-background:\s*hsl\(260 42\.86% 98\.63%\);/,
		);
		expect(shell).toMatch(
			/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{\s*--page-background:\s*hsl\(0 0% 7\.06%\);/,
		);
		expect(shell).toMatch(
			/html,\s*body,\s*#root\s*\{\s*background-color:\s*var\(--page-background\);/,
		);
	});

	test("hides the HTML splash only for iOS standalone", () => {
		expect(shell).toContain("/iPad|iPhone|iPod/.test(navigator.userAgent)");
		expect(shell).toContain('window.matchMedia?.("(display-mode: standalone)")');
		expect(shell).toContain("navigator.standalone === true");
		expect(shell).toContain('document.documentElement.dataset.iosStandalone = "true"');
		expect(shell).toMatch(
			/html\[data-ios-standalone="true"\]\s+#boot-splash\s*\{[^}]*display:\s*none !important;/,
		);
		expect(shell).not.toMatch(/^\s*#boot-splash\s*\{[^}]*display:\s*none/m);
	});

	test("keeps ThemeProvider persisted mode and web canvas in sync", () => {
		expect(themeSource).toContain('const THEME_MODE_KEY = "role.themeMode";');
		expect(themeSource).toContain('document.documentElement.classList.toggle("dark"');
		expect(themeSource).toMatch(
			/style\.setProperty\(\s*"--page-background",\s*colorTokens\[resolved\]\.background,?\s*\);/,
		);
	});

	test("uses the validated overlap only for the iOS standalone web marker", () => {
		expect(IOS_PWA_NAVBAR_OVERLAP).toBe(30);
		expect(
			getIosPwaNavbarOverlap("web", htmlDocument("true")),
		).toBe(IOS_PWA_NAVBAR_OVERLAP);
		expect(getIosPwaNavbarOverlap("ios", htmlDocument("true"))).toBe(0);

		for (const surface of ["desktop web", "Android web"]) {
			expect(getIosPwaNavbarOverlap("web", htmlDocument())).toBe(0);
		}
	});

	test("applies the shared overlap to both tab shell wrappers", () => {
		for (const layoutSource of [
			consumerLayoutSource,
			businessLayoutSource,
		]) {
			expect(layoutSource).toContain(
				'import { getIosPwaNavbarOverlap } from "@/src/core/ios-pwa-navbar";',
			);
			expect(layoutSource).toContain(
				"bottom: -getIosPwaNavbarOverlap()",
			);
		}

		expect(consumerLayoutSource).toContain("<OuterBar />");
		expect(consumerLayoutSource).not.toContain("colors.green");
		expect(consumerLayoutSource).not.toMatch(/height:\s*40/);
	});

	test("keeps Navbar safe-area padding independent of the wrapper overlap", () => {
		expect(navbarSource).toContain("const paddingBottom = Platform.select");
		expect(navbarSource).toContain("env(safe-area-inset-bottom, 0px)");
		expect(navbarSource).toContain("paddingBottom,");
	});
});
