/**
 * El JSON-LD de la organización: la única señal de geolocalización que el sitio
 * publica hoy.
 *
 * POR QUÉ ESTE TEST EXISTE. La landing vende un marketplace con presencia
 * territorial real —`LAUNCH_CITIES` dice Santo Domingo, Quito, Guayaquil, Cuenca
 * y Manta— y el `Organization` que emitía no tenía ni un geoname: `name`, `url`,
 * `logo`, `description`. Para un negocio local, eso es la diferencia entre que
 * Google lo relacione con una ciudad y que lo trate como un sitio genérico.
 *
 * Lo que el test NO cubre, a propósito:
 *
 *  · `address`. `legal.controller_identity` dice "identidad legal pendiente de
 *    publicación". Un `PostalAddress` inventado es peor que ninguno: es
 *    structured data falso en un sitio que además pide consentimientos de
 *    datos en `/privacy`.
 *  · `sameAs`. Las seis filas `social.*_url` todavía no existen (`store-links.ts`
 *    las documenta como "create in admin"), así que el array sería vacío.
 */
import { describe, expect, test } from "bun:test";

// `seo.ts` resuelve el dominio en el momento de la llamada, y sin esto
// `getSiteUrl()` tiraría. Se fija antes del import —los imports de ESM se
// evalúan antes que el cuerpo del módulo— y por eso es un `await import()` y no
// un `import` estático.
process.env.VITE_SITE_URL = "https://role.app";

const { organizationJsonLd } = await import("../seo");
const { LAUNCH_CITIES } = await import("../faq");

describe("organizationJsonLd", () => {
	test("declara areaServed con una entrada por cada ciudad de lanzamiento", () => {
		const ld = organizationJsonLd();
		const areaServed = ld.areaServed as { name: string }[];

		expect(Array.isArray(areaServed)).toBe(true);
		expect(areaServed).toHaveLength(LAUNCH_CITIES.length);
		expect(areaServed.map((c) => c.name)).toEqual([...LAUNCH_CITIES]);
	});

	test("cada ciudad es un City dentro de Ecuador", () => {
		// El `containedInPlace` es lo que le dice a Google que la lista es de
		// ciudades del mismo país y no un intento de aparecer en todas partes.
		// Sin él, cinco `City` sueltas se leen como cobertura global.
		for (const city of organizationJsonLd().areaServed as {
			"@type": string;
			name: string;
			containedInPlace: { "@type": string; name: string };
		}[]) {
			expect(city["@type"]).toBe("City");
			expect(city.containedInPlace).toEqual({
				"@type": "Country",
				name: "Ecuador",
			});
		}
	});

	test("no hay ciudades duplicadas ni vacías", () => {
		const names = (organizationJsonLd().areaServed as { name: string }[]).map(
			(c) => c.name,
		);
		expect(new Set(names).size).toBe(names.length);
		expect(names.every((n) => n.trim().length > 0)).toBe(true);
	});

	test("url y logo son absolutas y del dominio configurado", () => {
		// El mismo guard que ya se aplica al canonical: un `logo` relativo no lo
		// puede leer un crawler, y uno del dominio equivocado apunta a otro sitio.
		const ld = organizationJsonLd();
		expect(ld.url).toBe("https://role.app/");
		expect(ld.logo).toBe("https://role.app/icon.svg");
	});

	test("el type y el context siguen siendo los que espera schema.org", () => {
		const ld = organizationJsonLd();
		expect(ld["@context"]).toBe("https://schema.org");
		expect(ld["@type"]).toBe("Organization");
	});
});
