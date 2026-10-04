import { describe, expect, test } from "bun:test";
import { ApiClientError } from "@/lib/api/errors";
import { negociosSinDueño } from "../announcements.errors";

/**
 * El mapper que decide si un error de la API es "el negocio sin dueño" y cuáles
 * son los negocios.
 *
 * Lo que se mide acá es el reconocimiento, que es la parte que puede mentir: si
 * reconoce un 400 que no es, el panel le atribuye al operador un motivo falso; y
 * si NO reconoce el suyo, el operador vuelve a ver un error genérico y la
 * información de qué negocios son se pierde.
 */

const NEGOCIO_SIN_DUEÑO = "44444444-4444-4444-8444-444444444444";
const OTRO_NEGOCIO_SIN_DUEÑO = "55555555-5555-4555-8555-555555555555";

/** El mensaje exacto de `BUSINESS_WITHOUT_OWNER` (`announcements.service.ts`). */
function mensajeDeLaAPI(...ids: string[]): string {
	return `No se puede publicar: estos negocios no tienen dueño asignado y el aviso no llegaría a nadie: ${ids.join(", ")}`;
}

const sinDueño = (status: number, message: string) =>
	new ApiClientError({ status, message });

describe("el 400 del negocio sin dueño", () => {
	test("devuelve los ids que nombró el servidor", () => {
		expect(
			negociosSinDueño(sinDueño(400, mensajeDeLaAPI(NEGOCIO_SIN_DUEÑO))),
		).toEqual([NEGOCIO_SIN_DUEÑO]);
	});

	test("devuelve TODOS los negocios sin dueño, en el orden del mensaje", () => {
		expect(
			negociosSinDueño(
				sinDueño(
					400,
					mensajeDeLaAPI(NEGOCIO_SIN_DUEÑO, OTRO_NEGOCIO_SIN_DUEÑO),
				),
			),
		).toEqual([NEGOCIO_SIN_DUEÑO, OTRO_NEGOCIO_SIN_DUEÑO]);
	});

	// El servidor deduplica antes de nombrar, pero el panel no depende de eso: un
	// id repetido sería una clave de React repetida en la lista de negocios.
	test("no repite un id que el mensaje trae dos veces", () => {
		expect(
			negociosSinDueño(
				sinDueño(400, mensajeDeLaAPI(NEGOCIO_SIN_DUEÑO, NEGOCIO_SIN_DUEÑO)),
			),
		).toEqual([NEGOCIO_SIN_DUEÑO]);
	});
});

describe("lo que NO es el negocio sin dueño", () => {
	// El otro 400 de la misma ruta: `SPECIFIC_WITHOUT_TARGET`. Reconocerlo por sus
	// ids mentiría sobre un motivo que no es, así que tiene que volver vacío.
	test("el 400 de la audiencia sin destino no se confunde", () => {
		expect(
			negociosSinDueño(
				sinDueño(
					400,
					"Un aviso para audiencia específica necesita al menos un user_id o business_id",
				),
			),
		).toEqual([]);
	});

	// El caso peligroso del reconocimiento por texto: CUALQUIER 400 que nombre
	// un id. Hoy la API no tiene otro —el 400 con ids es este—, pero el día que lo
	// tenga (un slug duplicado, el id de otra entidad) este mapper le atribuiría
	// al operador el motivo equivocado, que es peor que no saber nada. Por eso el
	// status NO alcanza como filtro y la marca es obligatoria.
	test("un 400 que nombre ids sin ser el del negocio sin dueño no se reconnaît", () => {
		expect(
			negociosSinDueño(
				sinDueño(
					400,
					`No se puede publicar: ya hay un aviso activo para: ${NEGOCIO_SIN_DUEÑO}`,
				),
			),
		).toEqual([]);
	});

	test("otro error con status 400 tampoco", () => {
		expect(negociosSinDueño(sinDueño(400, "Titulo ya existe"))).toEqual([]);
	});

	// El status filtra por su cuenta, y también hace falta. Si un 5xx llegara con
	// esa frase, atribuirle "no tiene dueño" sería un motivo falso sobre un
	// negocio que sí lo tiene —justo lo que la API evita a propósito cuando no
	// puede preguntar (`announcements_owner_resolve_failed`).
	test("un 5xx con la frase exacta no se reconoce", () => {
		expect(
			negociosSinDueño(sinDueño(500, mensajeDeLaAPI(NEGOCIO_SIN_DUEÑO))),
		).toEqual([]);
	});

	// La redacción del mensaje puede cambiar sin romper contrato: si un día no
	// trae ids reconocibles, el panel cae al párrafo genérico en vez de inventar.
	test("una redacción nueva sin ids reconocibles devuelve vacío, no un id inventado", () => {
		expect(
			negociosSinDueño(
				sinDueño(400, "No se puede publicar: hay negocios sin dueño."),
			),
		).toEqual([]);
	});

	test("un throw que no es de la API devuelve vacío", () => {
		expect(
			negociosSinDueño(new Error(mensajeDeLaAPI(NEGOCIO_SIN_DUEÑO))),
		).toEqual([]);
		expect(negociosSinDueño(undefined)).toEqual([]);
		expect(
			negociosSinDueño({ message: mensajeDeLaAPI(NEGOCIO_SIN_DUEÑO) }),
		).toEqual([]);
	});
});
