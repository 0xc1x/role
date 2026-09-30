import { z } from "zod";

/**
 * La regla de `VITE_API_URL`, en un solo lugar y sin dependencias de runtime.
 *
 * ─── Por qué NO es un `.default()` silencioso ───────────────────────────────
 *
 * Antes esto era `z.url().default("http://localhost:4001/api/v1")` parseado en
 * el módulo. Medido: con la variable ausente no crashea (apunta a la API real
 * sin avisar) y con la variable INVÁLIDA (`"not-a-url"`) el `ZodError` salta al
 * cargar el módulo, Vite levanta igual, y TODAS las rutas responden
 * `500 {"message":"HTTPError"}`. El error real solo existe en el stdout del
 * dev server: desde el navegador, un panel mal configurado es indistinguible de
 * un panel roto. Eso no es robustez, es una trampa de diagnóstico.
 *
 * Entonces el default se conserva pero deja de ser invisible, y lo inválido se
 * convierte en un fallo de arranque (ver `vite.config.ts`, que es el primer
 * proceso que corre y el que puede morirse con un mensaje legible).
 *
 * ─── Por qué el default NO es un error ─────────────────────────────────────
 *
 * `localhost:4001` es la máquina del propio dev y el valor de `.env.example`,
 * así que no puede apuntar a nada que el dev no haya elegido. Convertirlo en
 * error rompería `bun run build` en CI, donde no hay `.env` (está gitignored) y
 * nadie pasó la variable. La consecuencia del default se avisa en consola en
 * lugar de impedir un build que la sección de e2e necesita.
 */
export const DEFAULT_API_URL = "http://localhost:4001/api/v1";

/** `z.url()` acepta cualquier esquema; la API se habla por http(s) o no se habla. */
const ApiUrlSchema = z
	.url()
	.refine((url) => url.startsWith("http://") || url.startsWith("https://"), {
		message: "debe empezar por http:// o https://",
	});

export type ApiUrlEnv = { VITE_API_URL: string };

/**
 * Valida la configuración de la API.
 *
 * Ausente → default, con `usedDefault` para que el arranque lo anuncie.
 * Presente e inválida → `Error` con el valor recibido y el motivo. Quien lo
 * llama decide si eso muere el proceso (lo muere `vite.config.ts`).
 */
export function resolveApiUrl(raw: string | undefined): {
	url: string;
	usedDefault: boolean;
} {
	if (raw === undefined || raw.trim() === "") {
		return { url: DEFAULT_API_URL, usedDefault: true };
	}

	const parsed = ApiUrlSchema.safeParse(raw.trim());
	if (!parsed.success) {
		const reason = parsed.error.issues[0]?.message ?? "no es una URL válida";
		throw new Error(
			`VITE_API_URL inválida: ${JSON.stringify(raw)} (${reason}).\n` +
				`  Esperaba algo como ${DEFAULT_API_URL}.\n` +
				"  Sin esta variable el panel no puede hablar con la API, así que " +
				"arrancar con ella rota solo produce errores opacos más adelante. " +
				"  Corregí el valor en el `.env` de apps/admin o en el entorno.",
		);
	}

	return { url: parsed.data, usedDefault: false };
}
