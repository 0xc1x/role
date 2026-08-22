import { z } from "zod";

/**
 * Typed environment configuration for the Rolé mobile app.
 *
 * All values are injected via EXPO_PUBLIC_* environment variables
 * (Metro inlines them at build time). Nothing is hardcoded — secrets
 * and per-environment values live in `.env.*` files consumed by Expo.
 *
 * See apps/mobile/.env.example for the full contract.
 */
const envSchema = z.object({
	/** Supabase project URL (https://<project>.supabase.co) */
	EXPO_PUBLIC_SUPABASE_URL: z.string().url(),
	/** Supabase anon (public) key */
	EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
	/** Sentry DSN — optional, empty disables crash reporting */
	EXPO_PUBLIC_SENTRY_DSN: z.string().optional().default(""),
	/** Google Maps API key — required for the explore map on native */
	EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().optional().default(""),
	/** Deep-link target for password recovery emails */
	EXPO_PUBLIC_AUTH_RESET_REDIRECT_URL: z.string().optional().default(""),
	/** Runtime environment label (development | staging | production) */
	EXPO_PUBLIC_ENVIRONMENT: z.string().optional().default("development"),
});

export type AppEnv = z.infer<typeof envSchema>;

function loadEnv(): AppEnv {
	// Metro inlines ONLY literal member accesses like `process.env.EXPO_PUBLIC_X`
	// at build time. Passing `process.env` wholesale (e.g. `safeParse(process.env)`)
	// defeats that: on static web exports there is no runtime process.env, every
	// value arrives undefined and validation fails with a blank screen.
	// So each variable must be read explicitly, by dotted name.
	const raw = {
		EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
		EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
		EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
		EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
		EXPO_PUBLIC_AUTH_RESET_REDIRECT_URL:
			process.env.EXPO_PUBLIC_AUTH_RESET_REDIRECT_URL,
		EXPO_PUBLIC_ENVIRONMENT: process.env.EXPO_PUBLIC_ENVIRONMENT,
	};
	const parsed = envSchema.safeParse(raw);
	if (!parsed.success) {
		// Fail loudly at startup instead of crashing mid-session with a
		// cryptic network error. Fields are public (anon key), so the
		// message never leaks secrets.
		const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
		throw new Error(
			`Configuración de entorno inválida. Faltan o son inválidas: ${missing}. ` +
				"Copia apps/mobile/.env.example a apps/mobile/.env.local y completa los valores.",
		);
	}
	return parsed.data;
}

export const env: AppEnv = loadEnv();

export const isProd = env.EXPO_PUBLIC_ENVIRONMENT === "production";
