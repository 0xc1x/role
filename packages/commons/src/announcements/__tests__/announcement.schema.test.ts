import { describe, expect, it } from "bun:test";
import { PaginatedAnnouncementsSchema } from "../dtos/announcement.dto";
import {
	AnnouncementListQuerySchema,
	AnnouncementSchema,
	CreateAnnouncementSchema,
	PatchAnnouncementSchema,
	UpdateAnnouncementSchema,
} from "../schemas/announcement.schema";

const UUID = "3f1b1a4e-2c6d-4a5f-9c2e-1f0d2b3c4d5e";
const OTHER_UUID = "9a8b7c6d-5e4f-4a3b-b2c1-d0e9f8a7b6c5";

/** Payload mínimo de creación: solo lo que la base exige sin default. */
const minimalCreate = {
	title: "Mantenimiento del sábado",
	body: "No hay ofertas nuevas entre las 3 y las 5 de la tarde.",
	severity: "info",
	audience_kind: "all",
};

/** Fila completa de `public.announcements`, con los defaults de la base puestos. */
const fullRow = {
	id: UUID,
	...minimalCreate,
	priority: 0,
	active: true,
	start_at: null,
	end_at: null,
	created_at: "2026-10-03T12:00:00+00:00",
	updated_at: "2026-10-03T12:00:00+00:00",
};

/**
 * La fila menos un campo. Cada campo por separado y en su propio test: si se
 * sacan los tres juntos, alcanza con que uno solo sea obligatorio para que el
 * test siga verde, y que `id` o `created_at` salgan del read path no lo
 * detectaría nadie.
 */
const rowWithout = (field: "id" | "created_at" | "updated_at") => {
	const { [field]: _omitido, ...resto } = fullRow;
	return resto;
};

const title = (length: number) => "a".repeat(length);
const body = (length: number) => "b".repeat(length);

// Los límites de title y body están CHECK`eados en Postgres. Un contrato que
// acepta 2 caracteres pasa un typecheck y revienta en runtime, contra el CHECK;
// uno que rechaza 121 rechaza algo que la base guarda. Los dos bordes se miden.

describe("AnnouncementSchema · los límites que la base ya CHECKea", () => {
	it("rechaza un title de 2 caracteres", () => {
		expect(
			CreateAnnouncementSchema.safeParse({ ...minimalCreate, title: title(2) })
				.success,
		).toBe(false);
	});

	it("acepta un title de 3 caracteres", () => {
		expect(
			CreateAnnouncementSchema.safeParse({ ...minimalCreate, title: title(3) })
				.success,
		).toBe(true);
	});

	it("acepta un title de 120 caracteres", () => {
		expect(
			CreateAnnouncementSchema.safeParse({
				...minimalCreate,
				title: title(120),
			}).success,
		).toBe(true);
	});

	it("rechaza un title de 121 caracteres", () => {
		expect(
			CreateAnnouncementSchema.safeParse({
				...minimalCreate,
				title: title(121),
			}).success,
		).toBe(false);
	});

	it("rechaza un body de 2 caracteres", () => {
		expect(
			CreateAnnouncementSchema.safeParse({ ...minimalCreate, body: body(2) })
				.success,
		).toBe(false);
	});

	it("acepta un body de 3 caracteres", () => {
		expect(
			CreateAnnouncementSchema.safeParse({ ...minimalCreate, body: body(3) })
				.success,
		).toBe(true);
	});

	it("acepta un body de 2000 caracteres", () => {
		expect(
			CreateAnnouncementSchema.safeParse({ ...minimalCreate, body: body(2000) })
				.success,
		).toBe(true);
	});

	it("rechaza un body de 2001 caracteres", () => {
		expect(
			CreateAnnouncementSchema.safeParse({ ...minimalCreate, body: body(2001) })
				.success,
		).toBe(false);
	});

	it("cuenta code points como char_length, con emojis", () => {
		// El CHECK de Postgres es char_length, que también cuenta code points: si el
		// contrato contara unidades UTF-16, estos dos casos divergirían de la base.
		expect(
			CreateAnnouncementSchema.safeParse({
				...minimalCreate,
				title: "🫠".repeat(120),
			}).success,
		).toBe(true);
		expect(
			CreateAnnouncementSchema.safeParse({
				...minimalCreate,
				title: "🫠".repeat(121),
			}).success,
		).toBe(false);
	});
});

describe("AnnouncementSchema · el vocabulario que los CHECK acotan", () => {
	it("rechaza un severity fuera de info|required", () => {
		expect(
			CreateAnnouncementSchema.safeParse({
				...minimalCreate,
				severity: "warning",
			}).success,
		).toBe(false);
	});

	it("acepta info y required, y nada más", () => {
		for (const severity of ["info", "required"]) {
			expect(
				CreateAnnouncementSchema.safeParse({ ...minimalCreate, severity })
					.success,
			).toBe(true);
		}
	});

	it("rechaza un audience_kind fuera de los cuatro", () => {
		expect(
			CreateAnnouncementSchema.safeParse({
				...minimalCreate,
				audience_kind: "everyone",
			}).success,
		).toBe(false);
	});

	it("acepta los cuatro audience_kind", () => {
		for (const audience_kind of [
			"all",
			"consumers",
			"businesses",
			"specific",
		]) {
			expect(
				CreateAnnouncementSchema.safeParse({ ...minimalCreate, audience_kind })
					.success,
			).toBe(true);
		}
	});
});

describe("AnnouncementSchema · la forma de la fila", () => {
	// Los tres campos que el read path tiene que garantir van en tres tests: en
	// uno solo, con que uno de los tres sea obligatorio el test pasa, y `AnnouncementSchema`
	// es lo que parsean las cinco capas siguientes.
	it("exige id", () => {
		expect(AnnouncementSchema.safeParse(fullRow).success).toBe(true);
		expect(AnnouncementSchema.safeParse(rowWithout("id")).success).toBe(false);
	});

	it("exige created_at", () => {
		expect(AnnouncementSchema.safeParse(fullRow).success).toBe(true);
		expect(AnnouncementSchema.safeParse(rowWithout("created_at")).success).toBe(
			false,
		);
	});

	it("exige updated_at", () => {
		expect(AnnouncementSchema.safeParse(fullRow).success).toBe(true);
		expect(AnnouncementSchema.safeParse(rowWithout("updated_at")).success).toBe(
			false,
		);
	});

	it("no admite updated_at en null: la columna es NOT NULL", () => {
		expect(
			AnnouncementSchema.safeParse({ ...fullRow, updated_at: null }).success,
		).toBe(false);
	});

	it("no pide deleted_at, que esta tabla no tiene", () => {
		// A diferencia de slides y tips, announcements se da de baja con
		// `active = false` y no tiene soft delete.
		const parsed = AnnouncementSchema.safeParse(fullRow);
		expect(parsed.success).toBe(true);
		expect(parsed.success && parsed.data).not.toHaveProperty("deleted_at");
	});

	it("no filtra la ventana invertida en lectura", () => {
		// La validación de la ventana es de escritura: la policy ya hace
		// inalcanzable una fila con end_at < start_at, así que en lectura no puede
		// dispararse. Si se disparara, tiraría la lista entera en el móvil.
		expect(
			AnnouncementSchema.safeParse({
				...fullRow,
				start_at: "2026-10-05T00:00:00+00:00",
				end_at: "2026-10-04T00:00:00+00:00",
			}).success,
		).toBe(true);
	});

	it("no expone user_ids ni business_ids: son del camino de escritura", () => {
		const parsed = AnnouncementSchema.safeParse({
			...fullRow,
			audience_kind: "specific",
			user_ids: [UUID],
			business_ids: [OTHER_UUID],
		});
		expect(parsed.success).toBe(true);
		expect(parsed.success && parsed.data).not.toHaveProperty("user_ids");
		expect(parsed.success && parsed.data).not.toHaveProperty("business_ids");
	});
});

describe("CreateAnnouncementSchema", () => {
	it("no exige id", () => {
		const parsed = CreateAnnouncementSchema.safeParse(minimalCreate);
		expect(parsed.success).toBe(true);
		expect(parsed.success && parsed.data).not.toHaveProperty("id");
	});

	it("trae los defaults que ya pone la base", () => {
		const parsed = CreateAnnouncementSchema.safeParse(minimalCreate);
		expect(parsed.success && parsed.data.active).toBe(true);
		expect(parsed.success && parsed.data.priority).toBe(0);
	});

	it("no exige start_at ni end_at: la ventana es opcional (D2)", () => {
		const parsed = CreateAnnouncementSchema.safeParse(minimalCreate);
		expect(parsed.success && parsed.data.start_at).toBeUndefined();
		expect(parsed.success && parsed.data.end_at).toBeUndefined();
	});

	it("acepta la audiencia dirigida por user_ids y por business_ids", () => {
		expect(
			CreateAnnouncementSchema.safeParse({
				...minimalCreate,
				audience_kind: "specific",
				user_ids: [UUID],
			}).success,
		).toBe(true);
		expect(
			CreateAnnouncementSchema.safeParse({
				...minimalCreate,
				audience_kind: "specific",
				business_ids: [OTHER_UUID],
			}).success,
		).toBe(true);
	});

	it("rechaza un id que no es uuid en la audiencia dirigida", () => {
		expect(
			CreateAnnouncementSchema.safeParse({
				...minimalCreate,
				audience_kind: "specific",
				user_ids: ["no-soy-un-uuid"],
			}).success,
		).toBe(false);
	});

	it("rechaza una ventana invertida", () => {
		expect(
			CreateAnnouncementSchema.safeParse({
				...minimalCreate,
				start_at: "2026-10-05T00:00:00+00:00",
				end_at: "2026-10-04T00:00:00+00:00",
			}).success,
		).toBe(false);
	});

	it("acepta una ventana cuyo fin es igual al inicio", () => {
		expect(
			CreateAnnouncementSchema.safeParse({
				...minimalCreate,
				start_at: "2026-10-04T00:00:00+00:00",
				end_at: "2026-10-04T00:00:00+00:00",
			}).success,
		).toBe(true);
	});

	it("acepta una ventana con una sola fecha", () => {
		expect(
			CreateAnnouncementSchema.safeParse({
				...minimalCreate,
				end_at: "2026-10-04T00:00:00+00:00",
			}).success,
		).toBe(true);
	});
});

describe("UpdateAnnouncementSchema", () => {
	it("rechaza un cuerpo vacío: un PATCH sin campos no es un PATCH", () => {
		expect(UpdateAnnouncementSchema.safeParse({}).success).toBe(false);
	});

	it("aplica los mismos límites de longitud que la creación", () => {
		expect(
			UpdateAnnouncementSchema.safeParse({ title: title(2) }).success,
		).toBe(false);
		expect(
			UpdateAnnouncementSchema.safeParse({ title: title(3) }).success,
		).toBe(true);
		expect(
			UpdateAnnouncementSchema.safeParse({ body: body(2001) }).success,
		).toBe(false);
		expect(
			UpdateAnnouncementSchema.safeParse({ body: body(2000) }).success,
		).toBe(true);
	});

	it("no deja escribir id ni timestamps", () => {
		const parsed = UpdateAnnouncementSchema.safeParse({
			id: OTHER_UUID,
			title: "Titulo corregido",
		});
		expect(parsed.success).toBe(true);
		expect(parsed.success && parsed.data).not.toHaveProperty("id");
	});

	it("no acota el rango de negocio de priority, porque la tabla no le pone CHECK", () => {
		// Un `min(0)` acá rechazaría en el panel una fila que Postgres guarda: la
		// tabla no tiene CHECK en priority, solo lo ordena. El rango que sí se
		// acota es el del tipo de la columna, dos tests más abajo.
		expect(UpdateAnnouncementSchema.safeParse({ priority: -1 }).success).toBe(
			true,
		);
	});

	it("acepta priority hasta el tope de un integer de Postgres", () => {
		// int4: el contrato tiene que aceptar todo lo que la columna acepta.
		expect(
			UpdateAnnouncementSchema.safeParse({ priority: 2147483647 }).success,
		).toBe(true);
		expect(
			UpdateAnnouncementSchema.safeParse({ priority: -2147483648 }).success,
		).toBe(true);
	});

	it("rechaza un priority que se sale del integer de Postgres", () => {
		// Un paso más allá, la base responde "integer out of range": un 500 con
		// mensaje de base de datos donde debería haber un 400 con mensaje de
		// validación. `z.number().int()` solo llega a safeint, así que sin este
		// borde el contrato lo dejaría pasar.
		expect(
			UpdateAnnouncementSchema.safeParse({ priority: 2147483648 }).success,
		).toBe(false);
		expect(
			UpdateAnnouncementSchema.safeParse({ priority: -2147483649 }).success,
		).toBe(false);
		expect(
			UpdateAnnouncementSchema.safeParse({ priority: 9999999999 }).success,
		).toBe(false);
	});

	it("aplica el rango de priority también al crear", () => {
		expect(
			CreateAnnouncementSchema.safeParse({
				...minimalCreate,
				priority: 2147483647,
			}).success,
		).toBe(true);
		expect(
			CreateAnnouncementSchema.safeParse({
				...minimalCreate,
				priority: 2147483648,
			}).success,
		).toBe(false);
	});

	it("rechaza un priority decimal", () => {
		expect(UpdateAnnouncementSchema.safeParse({ priority: 1.5 }).success).toBe(
			false,
		);
	});

	it("deja cambiar la audiencia dirigida", () => {
		expect(
			UpdateAnnouncementSchema.safeParse({ user_ids: [UUID, OTHER_UUID] })
				.success,
		).toBe(true);
		expect(
			UpdateAnnouncementSchema.safeParse({ business_ids: ["no-soy-un-uuid"] })
				.success,
		).toBe(false);
	});

	it("valida la ventana solo cuando vienen las dos fechas", () => {
		expect(
			UpdateAnnouncementSchema.safeParse({
				start_at: "2026-10-05T00:00:00+00:00",
				end_at: "2026-10-04T00:00:00+00:00",
			}).success,
		).toBe(false);
		// Con una sola, la otra sigue en la base y no se puede comparar: el
		// contrato no inventa el dato que no tiene.
		expect(
			UpdateAnnouncementSchema.safeParse({
				start_at: "2026-10-05T00:00:00+00:00",
			}).success,
		).toBe(true);
	});
});

describe("AnnouncementListQuerySchema", () => {
	it("parsea la query del panel", () => {
		const parsed = AnnouncementListQuerySchema.safeParse({
			active: "true",
			severity: "required",
			page: "1",
			limit: "20",
		});
		expect(parsed.success).toBe(true);
		expect(parsed.success && parsed.data).toEqual({
			page: 1,
			limit: 20,
			active: true,
			severity: "required",
		});
	});

	it("perPage no es el nombre del parámetro: el del repo es limit", () => {
		// Se prueba para que el `perPage` que aparece en ejemplos no se cuele en un
		// cliente: se descarta en silencio y el panel recibe el limit por defecto.
		const parsed = AnnouncementListQuerySchema.safeParse({ perPage: "50" });
		expect(parsed.success).toBe(true);
		expect(parsed.success && parsed.data).not.toHaveProperty("perPage");
		expect(parsed.success && parsed.data.limit).toBe(20);
	});

	it("coerce active=0 a false", () => {
		const parsed = AnnouncementListQuerySchema.safeParse({ active: "0" });
		expect(parsed.success && parsed.data.active).toBe(false);
	});

	it("rechaza un severity que no existe", () => {
		expect(
			AnnouncementListQuerySchema.safeParse({ severity: "warning" }).success,
		).toBe(false);
	});

	it("deja la paginación con los defaults cuando no viene", () => {
		const parsed = AnnouncementListQuerySchema.safeParse({});
		expect(parsed.success && parsed.data.page).toBe(1);
		expect(parsed.success && parsed.data.limit).toBe(20);
	});

	it("lleva el search del panel a la salida, y no acepta uno vacío", () => {
		const parsed = AnnouncementListQuerySchema.safeParse({
			search: "mantenimiento",
		});
		expect(parsed.success).toBe(true);
		expect(parsed.success && parsed.data.search).toBe("mantenimiento");
		expect(AnnouncementListQuerySchema.safeParse({ search: "" }).success).toBe(
			false,
		);
	});
});

describe("PatchAnnouncementSchema", () => {
	it("arrastra los dos refine de Update, no es un partial desnudo", () => {
		// El alias existe porque el panel y la API se atan a este nombre. Si se
		// escribiera como `AnnouncementBaseSchema.partial()` en vez de una
		// referencia a UpdateAnnouncementSchema, los dos refine se irían sin que
		// nada se entere: es lo único que los ata.
		expect(
			PatchAnnouncementSchema.safeParse({
				start_at: "2026-10-05T00:00:00+00:00",
				end_at: "2026-10-04T00:00:00+00:00",
			}).success,
		).toBe(false);
		expect(PatchAnnouncementSchema.safeParse({}).success).toBe(false);
	});
});

describe("PaginatedAnnouncementsSchema", () => {
	const meta = { page: 1, limit: 20, total: 1, total_pages: 1 };

	it("envuelve la fila y la paginación del panel", () => {
		const parsed = PaginatedAnnouncementsSchema.safeParse({
			data: [fullRow],
			meta,
		});
		expect(parsed.success).toBe(true);
		expect(parsed.success && parsed.data.data[0]).toEqual(fullRow);
		expect(parsed.success && parsed.data.meta).toEqual(meta);
	});

	it("rechaza una fila que no es una announcement", () => {
		expect(
			PaginatedAnnouncementsSchema.safeParse({ data: [{ id: UUID }], meta })
				.success,
		).toBe(false);
	});
});
