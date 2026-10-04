import { z } from "zod";
import {
	BooleanQuerySchema,
	PaginationQuerySchema,
} from "../../_common/schemas/api.schema";
import { TimestamptzSchema, UuidSchema } from "../../_common/schemas/common";
import {
	AnnouncementSeveritySchema,
	AudienceKindSchema,
} from "../entities/announcement";

/**
 * La prioridad solo ordena (`priority DESC, created_at DESC`) y la tabla no le
 * pone CHECK: un `.min(0)` o un `.max(10)` acá rechazaría en el panel una fila
 * que Postgres guarda sin problema. El rango, si algún día se quiere, se
 * agrega primero como CHECK.
 */
const prioritySchema = z.number().int("La prioridad debe ser un número entero");

/** `uuid[]` del lado del cliente: el operador elige a quién le llega el aviso. */
const audienceIdsSchema = z.array(UuidSchema);

/**
 * `end_at` antes de `start_at` es una ventana que nadie puede leer: la policy
 * exige a la vez `now() >= start_at` y `now() < end_at`. Publicarla es un
 * anuncio muerto sin ningún error que lo delate, así que se rechaza al
 * escribir — y solo al escribir, porque en lectura no puede dispararse y, si
 * se disparara, tiraría la lista entera en vez de una fila.
 */
const announcementWindowRefinement = {
	refine: (data: { start_at?: string | null; end_at?: string | null }) => {
		if (data.start_at && data.end_at) {
			return new Date(data.end_at) >= new Date(data.start_at);
		}
		// Con una sola fecha la otra sigue en la base: no se valida contra un
		// dato que el payload no tiene.
		return true;
	},
	params: {
		message: "La fecha de fin debe ser posterior o igual a la fecha de inicio",
		path: ["end_at"],
	},
};

/**
 * 1. ESQUEMA BASE: Centraliza todas las reglas y mensajes de error.
 *
 * Los límites de `title` y `body` están CHECK`eados en Postgres
 * (`char_length between 3 and 120` / `between 3 and 2000`) y se miden en code
 * points, igual que `char_length`: si divergieran, el 400 llegaría desde la
 * base y no desde acá.
 */
const AnnouncementBaseSchema = z.object({
	title: z
		.string()
		.min(3, "El título debe tener al menos 3 caracteres")
		.max(120, "El título no debe superar los 120 caracteres"),
	body: z
		.string()
		.min(3, "El cuerpo debe tener al menos 3 caracteres")
		.max(2000, "El cuerpo no debe superar los 2000 caracteres"),
	severity: AnnouncementSeveritySchema,
	audience_kind: AudienceKindSchema,
	priority: prioritySchema,
	active: z.boolean(),
	start_at: TimestamptzSchema.nullable(),
	end_at: TimestamptzSchema.nullable(),
});

/**
 * Full announcement resource as returned by the API (ISO timestamps as
 * strings).
 *
 * Lo que NO está acá y sí está en la tabla: `user_ids` y `business_ids`. Son
 * el camino de escritura —el operador elige la audiencia al publicar— y
 * ninguna lectura los necesita; además, la misma fila la pueden leer muchos
 * dispositivos a la vez por la policy, así que mandarlos en el wire le
 * regalaría a cada uno la lista de todos los demás que la locan.
 */
export const AnnouncementSchema = AnnouncementBaseSchema.extend({
	id: UuidSchema,
	created_at: TimestamptzSchema,
	updated_at: TimestamptzSchema,
});

/**
 * Create payload. `active` y `priority` repiten acá el default de la columna
 * para que lo que el panel manda y lo que queda en la fila sean el mismo
 * número, y no dos que se parezcan.
 *
 * La audiencia dirigida entra solo por acá, y es la única forma de que un
 * `specific` tenga a quién llegar. Que un `specific` traiga al menos un id no se
 * valida en este archivo: es una regla del service de la API y del formulario
 * del panel, y un refine acá la rechazaría en el cliente sin vista previa.
 */
export const CreateAnnouncementSchema = AnnouncementBaseSchema.extend({
	active: z.boolean().optional().default(true),
	priority: prioritySchema.optional().default(0),
	user_ids: audienceIdsSchema.optional(),
	business_ids: audienceIdsSchema.optional(),
})
	.partial({ start_at: true, end_at: true })
	.refine(
		announcementWindowRefinement.refine,
		announcementWindowRefinement.params,
	);

/**
 * Update payload. Todo parcial y sin `id` ni timestamps: un PATCH que no los
 * menciona no los toca, así que editar un aviso no le pisa la fecha de
 * creación ni le permite cambiar su propia identidad.
 */
export const UpdateAnnouncementSchema = AnnouncementBaseSchema.extend({
	user_ids: audienceIdsSchema.optional(),
	business_ids: audienceIdsSchema.optional(),
})
	.partial()
	.refine((body) => Object.keys(body).length > 0, {
		message: "Se requiere al menos un campo para actualizar",
	})
	.refine(
		announcementWindowRefinement.refine,
		announcementWindowRefinement.params,
	);

/** Alias — PATCH uses the same partial contract as update. */
export const PatchAnnouncementSchema = UpdateAnnouncementSchema;

/** Query params schema for GET list (admin). */
export const AnnouncementListQuerySchema = PaginationQuerySchema.extend({
	search: z.string().min(1).max(100).optional(),
	severity: AnnouncementSeveritySchema.optional(),
	active: BooleanQuerySchema,
});
