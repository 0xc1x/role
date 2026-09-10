import { z } from "zod";

/**
 * Env pública de la landing, validada una vez al importar el cliente API.
 * VITE_API_URL es opcional para que el dev local funcione sin .env.
 */
const EnvSchema = z.object({
	VITE_API_URL: z.url().optional(),
	VITE_SITE_URL: z.string().optional(),
});

export const env = EnvSchema.parse({
	VITE_API_URL: import.meta.env.VITE_API_URL,
	VITE_SITE_URL: import.meta.env.VITE_SITE_URL,
});
