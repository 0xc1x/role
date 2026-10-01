import { z } from "zod";
import {
	PaginatedDataSchema,
	PaginationQuerySchema,
} from "../../_common/schemas/api.schema";
import { TimestamptzSchema, UuidSchema } from "../../_common/schemas/common";
import {
	CONTACT_DELIVERY_STATUSES,
	CONTACT_ROLES,
} from "../enums/contact.enum";

/**
 * `value` de la fila de contacto: el jsonb que escribe `POST /contact` en
 * `app_store`. NO tiene tipo en la base, así que este schema es el contrato de
 * lectura y la única defensa contra una fila que venga de otro camino.
 *
 * Tres criterios, a propósito:
 *
 *  - `email`, `role` y `city` son OBLIGATORIOS. Son los tres campos que
 *    `CreateContactSchema` no deja enviar vacíos, así que una fila de contacto
 *    real siempre los tiene; y son los que la identifican como mensaje de
 *    contacto. Sin ellos, un objeto cualquiera guardado bajo el namespace
 *    `contact` pasaba el parseo y salía en la bandeja como una fila "legible"
 *    con todos los campos en `null` — indistinguible de un mensaje realmente
 *    vacío, que es justo la confusión que el flag `readable` existe para
 *    evitar.
 *  - Se validan los TIPOS y nada más. No se repiten los `.max()` de
 *    `CreateContactSchema` (120/2000/254…): esos límites son una regla de
 *    escritura, y una fila vieja que los exceda perdería nombre, correo y
 *    mensaje — que el operador sí puede leer — por un detalle de longitud.
 *  - El objeto NO es `strict`. `contact.service` agrega `error` al `value`
 *    cuando la entrega del correo falla, y zod descarta las claves unknown en
 *    vez de fallar: una fila con error registrado tiene que seguir siendo
 *    legible.
 *
 * `to` y `from` se parsean a propósito (para que una fila con routing raro no
 * se vuelva ilegible) pero NUNCA se mapean a un DTO: son direcciones internas
 * de ruteo, no información del mensaje. Ver `contact-inbox.mapper.ts` en la API.
 */
export const ContactMessageValueSchema = z.object({
	name: z.string().nullish(),
	email: z.string(),
	role: z.enum(CONTACT_ROLES),
	city: z.string(),
	city_raw: z.string().nullish(),
	city_other: z.string().nullish(),
	message: z.string().nullish(),
	at: z.string().nullish(),
	ip: z.string().nullish(),
	to: z.string().nullish(),
	from: z.string().nullish(),
});

/**
 * Fila del listado. Campos que no se pudieron leer vienen en `null` y la fila
 * entera se marca `readable: false`: se lista igual, vacía, en vez de romper la
 * respuesta. Una sola fila con `value` corrupto no puede tumbar la bandeja.
 *
 * Deliberadamente AUSENTES: `to` y `from` (routing interno, nunca se
 * muestran) y `ip` (dato personal: solo va en el detalle).
 */
export const ContactMessageListItemSchema = z.object({
	id: UuidSchema,
	delivery_status: z.enum(CONTACT_DELIVERY_STATUSES),
	created_at: TimestamptzSchema,
	updated_at: TimestamptzSchema,
	readable: z.boolean(),
	name: z.string().nullable(),
	email: z.string().nullable(),
	role: z.enum(CONTACT_ROLES).nullable(),
	city: z.string().nullable(),
	/** Extracto del mensaje para la tabla. El texto íntegro va en el detalle. */
	excerpt: z.string().nullable(),
});

/** Detalle: el listado más el cuerpo del mensaje y la IP de origen. */
export const ContactMessageDetailSchema = ContactMessageListItemSchema.extend({
	message: z.string().nullable(),
	city_raw: z.string().nullable(),
	city_other: z.string().nullable(),
	/** `value.at`: el momento exacto en que se escribió el mensaje. */
	received_at: z.string().nullable(),
	ip: z.string().nullable(),
});

/**
 * Filtros del listado. NO lleva `namespace`: el endpoint está amarrado al
 * namespace `contact` en el servidor y no hay forma de que el cliente pida
 * otro. `ListContactMessagesQuerySchema` no es `strict`, así que un
 * `?namespace=otro` que llegue igual se descarta al parsear, no se obedece.
 */
export const ListContactMessagesQuerySchema = PaginationQuerySchema.extend({
	delivery_status: z.enum(CONTACT_DELIVERY_STATUSES).optional(),
});

/** Cuerpo canónico del listado: `{ data: ContactMessageListItem[], meta }`. */
export const ContactMessageListResponseSchema = PaginatedDataSchema(
	ContactMessageListItemSchema,
);
