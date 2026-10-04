import { describe, expect, test } from "bun:test";
import type { Announcement, AnnouncementSeverity } from "@0c1x/role-commons";

import {
	applyAcknowledgement,
	applyLocalDismissal,
	buildModalSequence,
} from "./announcement";

// El agrupado decide qué avisos ve la persona, en qué orden y cuántos modales
// tiene que atravesar. Si esta función agrupa mal, todo lo demás —RLS, API,
// panel— puede estar impecable y el producto sigue equivocándose: por eso la
// tabla de casos es la que sigue y cada caso mira la FORMA de la secuencia, no
// solo que devuelva algo.

const ID = {
	primero: "a0000000-0000-4000-8000-000000000001",
	segundo: "a0000000-0000-4000-8000-000000000002",
	tercero: "a0000000-0000-4000-8000-000000000003",
	cuarto: "a0000000-0000-4000-8000-000000000004",
	quinto: "a0000000-0000-4000-8000-000000000005",
	sexto: "a0000000-0000-4000-8000-000000000006",
	septimo: "a0000000-0000-4000-8000-000000000007",
	octavo: "a0000000-0000-4000-8000-000000000008",
} as const;

const FECHA = "2026-10-01T00:00:00.000Z";

/**
 * Aviso de `announcements` con los campos que el dominio lee.
 *
 * `audience_kind`, `active` y la ventana son PARÁMETROS y no constantes, y no
 * por completitud del type: los tres son dimensiones que el agrupado declara no
 * tocar porque son de la policy, y una constante fija haría que ningún test
 * variara esa dimensión —la afirmación "no filtra por audiencia" sería entonces
 * indecible, porque todos los fixtures serían de una sola audiencia—. Cada
 * `test(...)` que afirme que un campo NO se filtra tiene que traer un fixture
 * donde ese campo diga lo contrario.
 */
function aviso(
	id: string,
	severity: AnnouncementSeverity,
	extra?: {
		priority?: number;
		created_at?: string;
		audience_kind?: Announcement["audience_kind"];
		active?: boolean;
		start_at?: string | null;
		end_at?: string | null;
	},
): Announcement {
	return {
		id,
		title: `Aviso ${id.slice(-1)}`,
		body: "Cuerpo del aviso",
		severity,
		audience_kind: extra?.audience_kind ?? "all",
		priority: extra?.priority ?? 0,
		active: extra?.active ?? true,
		start_at: extra?.start_at ?? null,
		end_at: extra?.end_at ?? null,
		created_at: extra?.created_at ?? FECHA,
		updated_at: FECHA,
	};
}

/** Secuencia de kind, la forma en que la consume el modal del layout. */
function kinds(modals: ReturnType<typeof buildModalSequence>): string[] {
	return modals.map((modal) => modal.kind);
}

/** Ids que aparecen en la secuencia, en el orden en que aparecen. */
function idsOf(
	modals: ReturnType<typeof buildModalSequence>,
): (string | string[])[] {
	return modals.map((modal) =>
		modal.kind === "required"
			? modal.announcement.id
			: modal.announcements.map((a) => a.id),
	);
}

const NADA = new Set<string>();

describe("los avisos ya resueltos se descartan", () => {
	test("descarta los info ya descartados localmente", () => {
		const modals = buildModalSequence(
			[aviso(ID.primero, "info"), aviso(ID.segundo, "info")],
			NADA,
			new Set([ID.primero]),
		);

		expect(modals).toHaveLength(1);
		expect(idsOf(modals)).toEqual([[ID.segundo]]);
	});

	test("descarta los required ya registrados", () => {
		const modals = buildModalSequence(
			[aviso(ID.primero, "required"), aviso(ID.segundo, "required")],
			new Set([ID.primero]),
			NADA,
		);

		expect(modals).toHaveLength(1);
		expect(idsOf(modals)).toEqual([ID.segundo]);
	});

	test("un lote de info que se vació no deja un modal vacío", () => {
		// El caso límite de "descarta los info ya descartados": si el modal se
		// armara siempre, el usuario abriría un modal sin contenido — y peor, el
		// `conMax` del dominio contaría un modal que no existe.
		expect(
			buildModalSequence(
				[aviso(ID.primero, "info")],
				NADA,
				new Set([ID.primero]),
			),
		).toEqual([]);
	});
});

describe("D9: los info se acumulan, los required no", () => {
	test("los info van en un unico modal", () => {
		const modals = buildModalSequence(
			[
				aviso(ID.primero, "info"),
				aviso(ID.segundo, "info"),
				aviso(ID.tercero, "info"),
			],
			NADA,
			NADA,
		);

		expect(modals).toHaveLength(1);
		expect(kinds(modals)).toEqual(["info"]);
		expect(idsOf(modals)).toEqual([[ID.primero, ID.segundo, ID.tercero]]);
	});

	test("los required van de a uno", () => {
		const modals = buildModalSequence(
			[
				aviso(ID.primero, "required"),
				aviso(ID.segundo, "required"),
				aviso(ID.tercero, "required"),
			],
			NADA,
			NADA,
		);

		expect(kinds(modals)).toEqual(["required", "required", "required"]);
		expect(idsOf(modals)).toEqual([ID.primero, ID.segundo, ID.tercero]);
	});
});

describe("D10: el required va antes que el lote de info", () => {
	test("el required va antes que el lote de info", () => {
		const modals = buildModalSequence(
			[
				aviso(ID.primero, "info"),
				aviso(ID.segundo, "required"),
				aviso(ID.tercero, "info"),
			],
			NADA,
			NADA,
		);

		// El `info` de mayor `priority` entra PRIMERO en la lista, como lo entrega
		// la consulta: el agrupado no reordena, mueve los grupos.
		expect(kinds(modals)).toEqual(["required", "info"]);
		expect(idsOf(modals)).toEqual([ID.segundo, [ID.primero, ID.tercero]]);
	});

	test("con tres required y dos info son cuatro modales, sin intercalar", () => {
		const modals = buildModalSequence(
			[
				aviso(ID.primero, "info"),
				aviso(ID.segundo, "required"),
				aviso(ID.tercero, "info"),
				aviso(ID.cuarto, "required"),
				aviso(ID.quinto, "required"),
			],
			NADA,
			NADA,
		);

		expect(kinds(modals)).toEqual(["required", "required", "required", "info"]);
		expect(idsOf(modals)).toEqual([
			ID.segundo,
			ID.cuarto,
			ID.quinto,
			[ID.primero, ID.tercero],
		]);
	});
});

describe("el orden es el de la consulta: priority desc, created_at desc", () => {
	test("el orden dentro de cada grupo es priority y fecha", () => {
		// La lista llega EXACTAMENTE como la devuelve `ORDER BY priority DESC,
		// created_at DESC`: primero el de `priority` 9, después los dos de `priority`
		// 5 con el más nuevo delante, y al final el de `priority` 1. Los `required`
		// se separan en su propio grupo sin perder ese orden relativo —el de
		// `priority` 9 va al primer modal y el de `priority` 3 al segundo— y los
		// `info` conservan el suyo dentro del lote.
		const modals = buildModalSequence(
			[
				aviso(ID.segundo, "required", {
					priority: 9,
					created_at: "2026-10-02T00:00:00.000Z",
				}),
				aviso(ID.tercero, "info", {
					priority: 5,
					created_at: "2026-10-07T00:00:00.000Z",
				}),
				aviso(ID.primero, "info", {
					priority: 5,
					created_at: "2026-10-05T00:00:00.000Z",
				}),
				aviso(ID.cuarto, "info", {
					priority: 1,
					created_at: "2026-10-09T00:00:00.000Z",
				}),
				aviso(ID.quinto, "required", {
					priority: 3,
					created_at: "2026-10-01T00:00:00.000Z",
				}),
			],
			NADA,
			NADA,
		);

		expect(idsOf(modals)).toEqual([
			ID.segundo,
			ID.quinto,
			[ID.tercero, ID.primero, ID.cuarto],
		]);
	});

	test("no reordena: una lista al revés sale al revés", () => {
		// El reordenamiento es responsabilidad de la consulta, no del agrupado.
		// Esta lista viola el `ORDER BY` a propósito (la de menor `priority`
		// primero): si esta función se pusiera a ordenar por su cuenta, el test
		// se pondría rojo, y ese es el motivo de existir. Un `sort()` acá sería
		// una segunda copia de la regla de orden que divergiría de la del
		// repositorio sin que nadie lo note.
		const modals = buildModalSequence(
			[
				aviso(ID.primero, "required", { priority: 1 }),
				aviso(ID.segundo, "required", { priority: 9 }),
				aviso(ID.tercero, "info", { priority: 2 }),
				aviso(ID.cuarto, "info", { priority: 7 }),
			],
			NADA,
			NADA,
		);

		expect(idsOf(modals)).toEqual([
			ID.primero,
			ID.segundo,
			[ID.tercero, ID.cuarto],
		]);
	});
});

describe("cada set se consulta por severidad", () => {
	test("un required en el set local no se descarta", () => {
		// El caso que muerde: el descarte local es del `info`, y si el `required`
		// se buscara también ahí, un aviso que el operador degradó de `info` a
		// `required` desaparecería sin acknowledgement — un obligatorio que nadie
		// puede marcar como entendido y que por lo tanto vuelve en cada apertura,
		// para siempre.
		const modals = buildModalSequence(
			[aviso(ID.primero, "required")],
			NADA,
			new Set([ID.primero]),
		);

		expect(idsOf(modals)).toEqual([ID.primero]);
	});

	test("un info en el acknowledgement del servidor no se descarta", () => {
		// La otra mitad: los dos sets son disjuntos por construcción —uno es el
		// acknowledgement en servidor y el otro el descarte local— y lo que decide
		// cuál consulta cada fila es su severidad. Un `info` nunca se registra, así
		// que un id que aparezca en `acknowledgedIds` no lo puede volver invisible.
		const modals = buildModalSequence(
			[aviso(ID.primero, "info")],
			new Set([ID.primero]),
			NADA,
		);

		expect(idsOf(modals)).toEqual([[ID.primero]]);
	});
});

describe("la elegibilidad es de la policy, no del agrupado", () => {
	test("no filtra por audiencia: la policy ya decidió", () => {
		// El `specific` llega solo si `user_ids @> array[auth.uid()]`, así que si
		// está en la lista es para esta persona. Volver a preguntarlo acá —" ¿y si
		// es de negocios?"— sería una segunda copia del `USING`, y de dos copias
		// solo se corrige la que nadie mira. Peor: el `specific` es el único valor
		// que la policy resuelve mirando una columna que el cliente ni pide, así
		// que un filtro acá descartaría avisos que la base sí habilitó.
		const modals = buildModalSequence(
			[
				aviso(ID.primero, "info", { audience_kind: "all" }),
				aviso(ID.segundo, "info", { audience_kind: "specific" }),
				aviso(ID.tercero, "info", { audience_kind: "consumers" }),
			],
			NADA,
			NADA,
		);

		expect(idsOf(modals)).toEqual([[ID.primero, ID.segundo, ID.tercero]]);
	});

	test("no filtra por active: los cinco términos son de la policy", () => {
		// Una fila con `active = false` no llega: el `USING` la saca. Pero si
		// llegara, mostrarla es lo correcto para esta función, que no tiene nada
		// que aportar acá —y el día que la fila vuelva a `active = true` tiene
		// que volver a aparecer sin que nada más cambie.
		const modals = buildModalSequence(
			[aviso(ID.primero, "info"), aviso(ID.segundo, "info", { active: false })],
			NADA,
			NADA,
		);

		expect(idsOf(modals)).toEqual([[ID.primero, ID.segundo]]);
	});

	test("no filtra por ventana temporal: el reloj es del servidor", () => {
		// El `now()` del USING es el del servidor. Un reloj de cliente puede
		// discrepar por zona horaria o por reloj desfasado, y un `info` que la base
		// habilitó podría quedar afuera de la ventana —o al revés— por una
		// diferencia de minutos que la persona nunca va a poder explicar.
		const modals = buildModalSequence(
			[
				aviso(ID.primero, "info", { start_at: "2020-01-01T00:00:00.000Z" }),
				aviso(ID.segundo, "info", { end_at: "2020-01-01T00:00:00.000Z" }),
				aviso(ID.tercero, "info", {
					start_at: "2099-01-01T00:00:00.000Z",
					end_at: "2099-12-31T00:00:00.000Z",
				}),
			],
			NADA,
			NADA,
		);

		expect(idsOf(modals)).toEqual([[ID.primero, ID.segundo, ID.tercero]]);
	});
});

describe("una lista vacía devuelve una secuencia vacía", () => {
	test("sin avisos no hay modales que contar", () => {
		expect(buildModalSequence([], NADA, NADA)).toEqual([]);
	});
});

describe("applyLocalDismissal: lo ya descartado sale de la secuencia", () => {
	const secuencia = buildModalSequence(
		[
			aviso(ID.primero, "required"),
			aviso(ID.segundo, "info"),
			aviso(ID.tercero, "info"),
		],
		NADA,
		NADA,
	);

	test("saca del lote los ids descartados y deja el resto", () => {
		const modals = applyLocalDismissal(secuencia, new Set([ID.segundo]));

		expect(idsOf(modals)).toEqual([ID.primero, [ID.tercero]]);
	});

	test("un lote sin ids pendientes no es un modal", () => {
		const modals = applyLocalDismissal(
			secuencia,
			new Set([ID.segundo, ID.tercero]),
		);

		expect(idsOf(modals)).toEqual([ID.primero]);
	});

	test("un required no sale por descarte local: eso es el acknowledgement", () => {
		const modals = applyLocalDismissal(secuencia, new Set([ID.primero]));

		expect(idsOf(modals)).toEqual([ID.primero, [ID.segundo, ID.tercero]]);
	});
});

describe("applyAcknowledgement: el required registrado sale de la secuencia", () => {
	const secuencia = buildModalSequence(
		[
			aviso(ID.primero, "required"),
			aviso(ID.segundo, "info"),
			aviso(ID.tercero, "required"),
		],
		NADA,
		NADA,
	);

	test("saca solo el required del id y conserva el orden del resto", () => {
		// Sacar el del medio y no el último es lo que distingue esta función de un
		// `filter` que secoma el primer elemento: el orden de la cola lo decide
		// `buildModalSequence`, no el acknowledgement.
		const modals = applyAcknowledgement(secuencia, ID.primero);

		expect(idsOf(modals)).toEqual([ID.tercero, [ID.segundo]]);
	});

	test("un id que no está en la secuencia no la cambia", () => {
		const modals = applyAcknowledgement(secuencia, ID.cuarto);

		expect(idsOf(modals)).toEqual([ID.primero, ID.tercero, [ID.segundo]]);
	});

	test("saca el del id aunque no sea el primero de la cola", () => {
		// El caso que distingue esto de un `slice(1)`: la cola de una apertura
		// puede traer tres `required` y el que la persona entiende puede ser el
		// segundo. Un `slice` se comería el primero, que sigue sin entender.
		const modals = applyAcknowledgement(secuencia, ID.tercero);

		expect(idsOf(modals)).toEqual([ID.primero, [ID.segundo]]);
	});
});
