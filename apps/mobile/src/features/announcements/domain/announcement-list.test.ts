import { describe, expect, it } from "bun:test";
import type { Announcement } from "@0xc1x/role-commons";
import {
	buildAnnouncementList,
	localDismissalKey,
	localRequiredDismissalKey,
	MAX_LOCAL_DISMISSALS,
	MAX_LOCAL_REQUIRED_DISMISSALS,
} from "./announcement";

/**
 * Los ids son opacos porque acá NO pasan por el contrato: esta función es pura y
 * compara strings, así que no valida nada. Si la fixture pasara por
 * `AnnouncementSchema`, sus ids tendrían que ser uuids v4 de verdad — `z.uuid()`
 * chechea el nibble de versión y el de variante, y uno inventado se rechaza con
 * "Invalid UUID" en un lugar que no es la fixture.
 */
function aviso(id: string, severity: "info" | "required"): Announcement {
	return {
		id,
		title: `Aviso ${id}`,
		body: "Cuerpo",
		severity,
		audience_kind: "all",
		priority: 0,
		active: true,
		start_at: null,
		end_at: null,
		created_at: "2026-10-01T00:00:00.000Z",
		updated_at: "2026-10-01T00:00:00.000Z",
	};
}

const NADA = new Set<string>();

describe("la lista de avisos, con el estado de cada uno", () => {
	it("un required pendiente es pendiente", () => {
		const [fila] = buildAnnouncementList([aviso("a", "required")], NADA, NADA);
		expect(fila?.state).toBe("pending");
	});

	it("un required entendido sale entendido", () => {
		const lista = buildAnnouncementList(
			[aviso("a", "required")],
			new Set(["a"]),
			NADA,
		);
		expect(lista[0]?.state).toBe("acknowledged");
	});

	it("un required descartado en el dispositivo sale descartado", () => {
		// El caso nuevo: silenciar un obligatorio SIN entenderlo. No escribe la
		// fila de acknowledgement, así que el estado sale del almacén local y no
		// del servidor.
		const lista = buildAnnouncementList(
			[aviso("a", "required")],
			NADA,
			new Set(["a"]),
		);
		expect(lista[0]?.state).toBe("dismissed");
	});

	it("la lista MUESTRA lo resuelto; el modal es el que lo filtra", () => {
		// La razón por la que esta función existe y no reusa `buildModalSequence`:
		// esa saca lo que la persona ya resolvió, que es justo lo que una lista de
		// "ver todos" tiene que mostrar.
		const lista = buildAnnouncementList(
			[aviso("a", "required"), aviso("b", "info")],
			new Set(["a"]),
			new Set(["b"]),
		);
		expect(lista.map((f) => f.announcement.id)).toEqual(["a", "b"]);
	});

	it("un info nunca está entendido: no tiene acknowledgement", () => {
		const lista = buildAnnouncementList(
			[aviso("b", "info")],
			new Set(["b"]),
			NADA,
		);
		expect(lista[0]?.state).toBe("pending");
	});

	it("el entendido le gana al descartado", () => {
		// Un id en los dos sets no puede pasar: la fila de acknowledgement no tiene
		// policy de UPDATE ni de DELETE, así que un `required` entendido que además
		// quedara con el id en el almacén local tiene que seguir saliendo
		// entendido.
		const lista = buildAnnouncementList(
			[aviso("a", "required")],
			new Set(["a"]),
			new Set(["a"]),
		);
		expect(lista[0]?.state).toBe("acknowledged");
	});

	it("conserva el orden que vino de la consulta, sin reordenar", () => {
		// La lista no inventa un orden propio: la policy y el `order` ya lo
		// decidieron. Reordenar por severidad sería una segunda copia de D9/D10 con
		// una diferencia —el modal pone los required primero y esta los muestra
		// como vinieron— y de las dos copias se corrige la que nadie mira.
		const lista = buildAnnouncementList(
			[aviso("1", "info"), aviso("2", "required"), aviso("3", "info")],
			NADA,
			NADA,
		);
		expect(lista.map((f) => f.announcement.id)).toEqual(["1", "2", "3"]);
	});

	it("conserva el anuncio entero, no una proyección", () => {
		const lista = buildAnnouncementList([aviso("a", "info")], NADA, NADA);
		expect(lista[0]?.announcement.title).toBe("Aviso a");
	});
});

describe("el almacén del descarte de un obligatorio", () => {
	it("tiene su propia clave, distinta de la del info", () => {
		// Si compartieran clave, el `MAX_LOCAL_DISMISSALS` de los `info` —200 con
		// desalojo del más viejo— se cumpliría con avisos que la persona silenció a
		// propósito, y un `required` reaparecería solo. Un aviso viejo que nadie
		// miró es ruido; uno que alguien silenció y vuelve sin que haga nada es la
		// falla que esta pantalla viene a eliminar.
		expect(localRequiredDismissalKey("user")).not.toBe(
			localDismissalKey("user"),
		);
	});

	it("cambia con la audiencia, como la del info", () => {
		expect(localRequiredDismissalKey("user")).not.toBe(
			localRequiredDismissalKey("business"),
		);
	});

	it("tiene su propio tope, y es holgado", () => {
		// Un `required` es raro por definición —por eso es obligatorio—, así que
		// este almacén no necesita un tope estrecho. Pero lo necesita: la key es de
		// un dispositivo y no de una persona, y un almacén sin techo crece sin que
		// nadie lo decida.
		expect(MAX_LOCAL_REQUIRED_DISMISSALS).toBeGreaterThan(MAX_LOCAL_DISMISSALS);
	});
});
