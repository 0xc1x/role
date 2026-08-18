import * as Sentry from "@sentry/react-native";

import { env } from "@/core/config/env";

export interface TrackEvent {
	category: string;
	action: string;
	label?: string;
	value?: number;
}

/**
 * Analytics service — Sentry breadcrumbs + optional events.
 * Initialized only when a DSN is present in the environment.
 */
export const analytics = {
	initialized: env.EXPO_PUBLIC_SENTRY_DSN.length > 0,

	init(): void {
		if (!this.initialized) return;
		Sentry.init({
			dsn: env.EXPO_PUBLIC_SENTRY_DSN,
			environment: env.EXPO_PUBLIC_ENVIRONMENT,
			tracesSampleRate: 0.1,
			sendDefaultPii: false,
		});
	},

	track(event: TrackEvent): void {
		if (!this.initialized) return;
		Sentry.addBreadcrumb({
			category: event.category,
			message: event.action,
			level: "info",
			data: event.label
				? { label: event.label, value: event.value }
				: undefined,
		});
	},

	trackError(error: unknown, context?: Record<string, unknown>): void {
		if (!this.initialized) return;
		Sentry.captureException(error, { extra: context });
	},

	setUser(userId: string | null): void {
		if (!this.initialized) return;
		if (userId) {
			Sentry.setUser({ id: userId });
		} else {
			Sentry.setUser(null);
		}
	},
};
