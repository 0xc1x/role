import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const appJson = JSON.parse(
	readFileSync(new URL("../../../app.json", import.meta.url), "utf8"),
) as {
	expo: {
		ios: { bundleIdentifier: string };
		android: { package: string; permissions: string[] };
		plugins: Array<string | [string, Record<string, unknown>]>;
	};
};

describe("Expo release configuration", () => {
	test("keeps the current identifiers and only justified permissions", () => {
		expect(appJson.expo.ios.bundleIdentifier).toBe("com.fudi.role");
		expect(appJson.expo.android.package).toBe("com.fudi.role");
		expect(appJson.expo.android.permissions).not.toContain(
			"android.permission.RECORD_AUDIO",
		);
		expect(appJson.expo.android.permissions).toContain("CAMERA");
		expect(appJson.expo.android.permissions).toContain(
			"ACCESS_COARSE_LOCATION",
		);
	});

	test("keeps the native plugins that justify the permissions", () => {
		const plugins = appJson.expo.plugins.map((plugin) =>
			Array.isArray(plugin) ? plugin[0] : plugin,
		);
		expect(plugins).toContain("expo-camera");
		expect(plugins).toContain("expo-location");
		expect(plugins).toContain("expo-notifications");
	});
});
