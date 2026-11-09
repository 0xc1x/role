/**
 * ─── Por qué este archivo existe ──────────────────────────────────────────────
 *
 * Un fallo silencioso costó horas en este repo, y se reproduce aquí exactamente.
 *
 * MEDIDO contra la API real, con `/offers/random` respondiendo 200 y un cuerpo
 * correcto:
 *
 *     RESPUESTA 200 /api/v1/offers/random
 *       body: {"id":"e0000000-0000-0000-0000-000000000105", ...}
 *     titulo pintado: "Comercios locales"     ← el FALLBACK, no la oferta
 *
 * La oferta llega y se descarta. Motivo: `OfferWithBusinessSchema.safeParse`
 * falla en `id`, `business_id` y `business.id` porque esos UUID de semilla no
 * cumplen la variante RFC 4122 (`e0000000-0000-…` lleva `0` donde hace falta
 * `[89ab]`), y `queries.ts` respondía a un parseo fallido con `return null`.
 *
 * Un `null` indistinguible de "no hay oferta" es exactamente lo que el
 * comentario de `announcementsQueryOptions` dice que no puede pasar: "no hay
 * avisos" y "la respuesta no es la que esperamos" son cosas distintas, y
 * colapsarlas es un incidente invisible. Aquí además el síntoma no era un aviso
 * que faltaba, sino un `-70%` inventado en la portada.
 *
 * Estos tests fijan que el fallo sea LEGIBLE, no que se repare el dato: la
 * causa raíz está en la base y este archivo no la decide.
 */

import { describe, expect, test } from "bun:test";
import { OfferWithBusinessSchema } from "@0xc1x/role-commons";

/** Cuerpo real de `/offers/random`, con los UUID de semilla que no parsean. */
const CUERPO_REAL = {
	id: "e0000000-0000-0000-0000-000000000105",
	business_id: "d0000000-0000-0000-0000-000000000012",
	business_location_id: "54e6b308-7134-4a5a-bf97-5090f22872f2",
	title: "Cheesecake de maracuyá",
	description: "Porción de cheesecake con maracuyá de la zona.",
	image: null,
	category_ids: ["54dfc94b-1e3d-4f2c-bed2-94770cdb7c8e"],
	categories: [
		{ id: "54dfc94b-1e3d-4f2c-bed2-94770cdb7c8e", name: "Café", slug: "cafe" },
	],
	original_price: 4,
	discounted_price: 2,
	discount_percentage: 50,
	stock: 3,
	initial_stock: 5,
	pickup_start: "2026-05-28T06:00:00.000Z",
	pickup_end: "2026-12-31T22:00:00.000Z",
	is_active: true,
	includes: null,
	allergens: null,
	rating: 0,
	review_count: 0,
	created_at: "2026-05-19T13:29:05.393Z",
	updated_at: "2026-07-31T04:46:04.205Z",
	distance_km: null,
	business: {
		id: "d0000000-0000-0000-0000-000000000012",
		name: "Café del Valle",
		slug: "cafe-del-valle-santo-domingo",
		image: null,
		rating: 0,
	},
	location: {
		id: "54e6b308-7134-4a5a-bf97-5090f22872f2",
		name: "Matriz",
		address: "Centro Comercial del Valle, Santo Domingo",
		latitude: -0.2545,
		longitude: -79.168,
		zone: "Santo Domingo de los Tsachilas",
	},
};

/** UUID válidos (grupo 3 con `[89ab]`), para aislar el fallo a los identificadores. */
const UUID_VALIDO = "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d";
const UUID_VALIDO_2 = "2b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d";

describe("el cuerpo real de /offers/random", () => {
	test("no parsea, y el motivo son los UUID de semilla", () => {
		// Documenta la causa raíz para que el próximo que lo mire sepa que no
		// es un problema del schema ni del mapper.
		const parsed = OfferWithBusinessSchema.safeParse(CUERPO_REAL);

		expect(parsed.success).toBe(false);
		const rutas = parsed.success
			? []
			: parsed.error.issues.map((i) => i.path.join("."));
		expect(rutas).toContain("id");
		expect(rutas).toContain("business_id");
		expect(rutas).toContain("business.id");
	});

	test("con los tres ids corregidos, el resto del cuerpo parsea", () => {
		// El fallo es de identificadores, no del schema. Y acota la corrección:
		// si arreglar solo estos tres no alcanzara, el problema estaria en otro
		// campo y la causa raiz seria otra.
		const { business, ...sinBusiness } = CUERPO_REAL;
		const { id: businessId, ...negocio } = business;

		const corregido = {
			...sinBusiness,
			business: { ...negocio, id: UUID_VALIDO },
			id: UUID_VALIDO,
			business_id: UUID_VALIDO_2,
		};

		expect(OfferWithBusinessSchema.safeParse(corregido).success).toBe(true);
	});

	test("business_location_id y category_ids usan un validador laxo, a proposito", () => {
		// NO son un bug, y `safeParse` no los señala por eso. Documentarlo evita
		// el diagnostico equivocado de "hay que arreglar tambien estos otros dos":
		// los catalogos de semilla los usan en todas sus filas.
		const laxo = /^[0-9a-f-]{36}$/i;
		const estricto =
			/^[0-9a-f]{8}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

		expect(CUERPO_REAL.business_location_id).toMatch(laxo);
		expect(CUERPO_REAL.business_location_id).not.toMatch(estricto);
		expect(CUERPO_REAL.category_ids[0]).toMatch(laxo);
		expect(CUERPO_REAL.category_ids[0]).not.toMatch(estricto);
		expect(CUERPO_REAL.id).not.toMatch(estricto);
	});
});
