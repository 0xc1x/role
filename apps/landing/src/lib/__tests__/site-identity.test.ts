/**
 * La identidad pública del sitio: el dominio que anuncia el buscador y los
 * correos a los que una persona puede escribir.
 *
 * EL DOMINIO: `role.ec` es el dominio del producto —el que se adquirió—. `role.app`
 * fue el viejo. Un default en el dominio viejo no es un default: es un correo
 * que nadie recibe y un canonical que apunta a otro sitio.
 *
 * POR QUÉ ESTE ARCHIVO LEE EL CÓDIGO FUENTE Y NO EL DOM: los correos de fallback
 * son literales que se le pasan a `useConfig(...)` —el primero que gana si la
 * fila de `app_config` no está— y no viven en un módulo del que se puedan
 * importar. Renderizar el pie entero para leer una cadena costaría un router y
 * una caché de React Query; leer el fuente cuesta una línea y no se puede
 * desincronizar del valor que se quiere afirmar. El mismo criterio usa
 * `legal-copy.test.ts` con `routes/help-center.tsx`.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { FALLBACK_SITE_URL, SITE_URL_REQUIRED_MESSAGE } from "../site-url";

/** Los archivos de la landing donde un correo puede llegar a una persona. */
const CON_CORREO = {
	pie: "../../components/footer.tsx",
	ayuda: "../../routes/help-center.tsx",
	negocios: "../../routes/for-business.tsx",
} as const;

function fuente(path: string): string {
	return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("el dominio que anuncia el sitio", () => {
	test("el fallback es el dominio del producto", () => {
		// `FALLBACK_SITE_URL` aparece por SÍMBOLO en casi todos los tests del
		// repo: un fallback en el dominio viejo pasaría todos ellos en verde.
		// Esta es la línea que afirma el VALOR, y por eso está escrita con el
		// valor adentro y no con el símbolo.
		expect(FALLBACK_SITE_URL).toBe("https://role.ec");
	});

	test("el mensaje de arranque ofrece el dominio del producto", () => {
		// Es lo que lee quien arranca sin la var: si no dice cuál es el dominio
		// bueno, no hay siguiente paso.
		expect(SITE_URL_REQUIRED_MESSAGE).toContain("https://role.ec");
		expect(SITE_URL_REQUIRED_MESSAGE).not.toContain("role.app");
	});
});

describe("los correos de fallback", () => {
	test("el pie, la ayuda y la página de negocios escriben a role.ec", () => {
		for (const [nombre, path] of Object.entries(CON_CORREO)) {
			// El dominio viejo no puede quedar en un archivo que el producto
			// muestra: es un correo que la persona escribe y nadie responde.
			expect(fuente(path), nombre).not.toContain("@role.app");
		}
		expect(fuente(CON_CORREO.pie)).toContain("hola@role.ec");
		expect(fuente(CON_CORREO.pie)).toContain("negocios@role.ec");
		expect(fuente(CON_CORREO.ayuda)).toContain("hola@role.ec");
		expect(fuente(CON_CORREO.ayuda)).toContain("negocios@role.ec");
		expect(fuente(CON_CORREO.negocios)).toContain("negocios@role.ec");
	});
});
