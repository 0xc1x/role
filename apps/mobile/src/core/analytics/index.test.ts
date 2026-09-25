import { expect, mock, test } from "bun:test";

const sentry = {
	init: mock(() => {}),
	addBreadcrumb: mock(() => {}),
	captureException: mock(() => {}),
	setUser: mock(() => {}),
};

mock.module("@sentry/react-native", () => sentry);

const dsn = "https://public@example.com/1";

test.each([
	["development", dsn, false],
	["dev", dsn, false],
	["staging", dsn, true],
	["production", dsn, true],
	["preview", dsn, true],
	["staging", "", false],
	["production", "", false],
] as const)(
	"Sentry in %s with DSN '%s' is enabled: %s",
	async (environment, sentryDsn, enabled) => {
		for (const fn of Object.values(sentry)) fn.mockClear();
		mock.module("@/src/core/config/env", () => ({
			env: {
				EXPO_PUBLIC_ENVIRONMENT: environment,
				EXPO_PUBLIC_SENTRY_DSN: sentryDsn,
			},
			isProd: environment === "production",
		}));

		// Reload module-level configuration for each environment without reading .env files.
		const { analytics } = (await import(
			`./index.ts?environment=${environment}&dsn=${Boolean(sentryDsn)}`
		)) as typeof import("./index");

		expect(analytics.initialized).toBe(enabled);
		expect(sentry.init).toHaveBeenCalledTimes(0);
		analytics.setConsent(enabled);
		analytics.init();
		analytics.init();
		expect(sentry.init).toHaveBeenCalledTimes(enabled ? 1 : 0);

		const error = new Error("Test failure");
		analytics.track({ category: "test", action: "run" });
		analytics.trackError(error, { source: "test" });
		analytics.setUser("test-user");
		analytics.setUser(null);

		expect(sentry.addBreadcrumb).toHaveBeenCalledTimes(enabled ? 1 : 0);
		expect(sentry.captureException).toHaveBeenCalledTimes(enabled ? 1 : 0);
		expect(sentry.setUser).toHaveBeenCalledTimes(enabled ? 2 : 0);
		if (enabled) {
			expect(sentry.init).toHaveBeenCalledWith(
				expect.objectContaining({
					dsn: sentryDsn,
					environment,
					enabled: true,
					tracesSampleRate: environment === "production" ? 0.1 : 0,
				}),
			);
			expect(sentry.captureException).toHaveBeenCalledWith(error, {
				extra: { source: "test" },
			});
			expect(sentry.setUser).toHaveBeenCalledWith({ id: "test-user" });
			expect(sentry.setUser).toHaveBeenLastCalledWith(null);
		}
	},
);
