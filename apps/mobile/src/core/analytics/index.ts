import * as Sentry from "@sentry/react-native";

import { env, isProd } from "@/core/config/env";

export interface TrackEvent {
	category: string;
	action: string;
	label?: string;
	value?: number;
}

const dsn = env.EXPO_PUBLIC_SENTRY_DSN;
const enabled = dsn.length > 0;
let didInit = false;

function doInit(): void {
	if (!enabled || didInit) return;
	didInit = true;
	Sentry.init({
		dsn,
		environment: env.EXPO_PUBLIC_ENVIRONMENT,
		enabled: true,
		tracesSampleRate: isProd ? 0.1 : 0,
		sendDefaultPii: false,
		enableNative: true,
		debug: false,
		attachStacktrace: true,
	});
}

// Init sincrónico y temprano: se ejecuta al importar el módulo
// (app/_layout lo importa y index.ts también lo puede importar).
// Funciona en nativo y web con el mismo DSN.
doInit();

/**
 * Analytics service — Sentry breadcrumbs + error reporting.
 * Nativo + web con el mismo DSN. Si EXPO_PUBLIC_SENTRY_DSN está vacío, no-op.
 */
export const analytics = {
	initialized: enabled,

	init(): void {
		doInit();
	},

	track(event: TrackEvent): void {
		if (!enabled) return;
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
		if (!enabled) return;
		Sentry.captureException(error, { extra: context });
	},

	setUser(userId: string | null): void {
		if (!enabled) return;
		if (userId) {
			Sentry.setUser({ id: userId });
		} else {
			Sentry.setUser(null);
		}
	},
};
