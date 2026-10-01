import { z } from "zod";
import {
	PaginatedDataSchema,
	PaginationQuerySchema,
} from "../../_common/schemas/api.schema";
import { TimestamptzSchema, UuidSchema } from "../../_common/schemas/common";
import { CONTACT_DELIVERY_STATUSES } from "../../contact/enums/contact.enum";
import { BUG_TRIAGE_STATES, ENTRY_ORIGINS } from "../enums/bug-report.enum";

/**
 * `value` de la fila de reporte: el jsonb que escribe el móvil con
 * `namespace = 'bug_report'`. NO tiene tipo en la base, así que este schema es
 * el contrato de lectura y la única defensa contra una fila que venga de otro
 * camino.
 *
 * Tres criterios, a propósito:
 *
 *  - `summary` es OBLIGATORIO, y es el ANCLA. Es el mismo criterio con el que
 *    `ContactMessageValueSchema` exige `email`/`role`/`city`: sin los campos que
 *    identifican la fila, cualquier objeto guardado bajo el namespace pasaba el
 *    parseo y salía en el panel como una fila "legible" con todo en `null` —
 *    indistinguible de un reporte realmente vacío, que es justo la confusión que
 *    el flag `readable` existe para evitar.
 *  - El objeto NO es `strict`, y por una razón que conviene tener a mano: el
 *    trigger `stamp_bug_reporter` sella `value.reporter_id` con `auth.uid()` en
 *    un BEFORE INSERT, o sea DESPUÉS de que el cliente escribiera lo suyo. Con
 *    `strict`, toda fila recién insertada sería ilegible — se listaría con
 *    `readable: false` y el operador no vería ni el resumen que el usuario acaba
 *    de escribir. `app_store` es un store genérico y mañana puede llevar las
 *    claves que quiera (`device_model`, `app_version`…); zod descarta lo que no
 *    conoce en vez de tirar la fila.
 *  - Se validan los TIPOS y nada más. El `.max()` del resumen, si algún día
 *    existe, es regla de escritura: una fila vieja que lo exceda no puede
 *    perder el texto que el usuario sí puede leer. Y por el mismo motivo no hay
 *    `.min(1)`: `summary: ""` pasa el parseo a propósito. La policy de insert no
 *    mira `value` en absoluto, así que una fila con el resumen vacío LLEGA a
 *    existir; si este schema la rechazara, saldría listada como `readable: false`
 *    y el operador vería una fila en blanco sin ninguna pista de qué pasó.
 *    Vacío es un reporte malo; ilegible es un reporte invisible.
 *
 * `images` son rutas dentro del bucket privado `bug_report_images`, no URLs: el
 * panel nunca ve el bucket crudo, el API las resuelve a URLs firmadas de corta
 * duración.
 */
export const BugReportValueSchema = z.object({
	summary: z.string(),
	description: z.string().nullish(),
	images: z.array(z.string()).nullish(),
	reporter_id: z.string().nullish(),
	at: z.string().nullish(),
});

/**
 * Fila del listado. Campos que no se pudieron leer vienen en `null` y la fila
 * entera se marca `readable: false`: se lista igual, vacía, en vez de romper la
 * respuesta. Una sola fila con `value` corrupto no puede tumbar el buzón.
 *
 * `state` y `origin` son NULLABLE a propósito: son columnas genéricas de
 * `app_store` y el insert del mensaje de contacto no nombra ninguna de las dos,
 * así que sus filas salen con las dos en NULL. Compartir tabla no es compartir
 * vocabulario.
 *
 * Y `state` nullable no es solo por eso: la columna es `text` sin CHECK, así
 * que el vocabulario NO está garantizado en la base. El que lo estrecha es el
 * mapper de la API, que compara `row.state` contra `BUG_TRIAGE_STATES` y cae a
 * `null` sin lanzar — el mismo trato que el `value` corrupto. Ojo con lo que
 * eso significa para el panel: una fila con `state` fuera de vocabulario sale
 * `readable: true, state: null`, indistinguible de "sin triar". El triaje solo
 * escribe contra `SetBugReportStateSchema`, y la API es la que valida antes de
 * escribir; estrechar con un `as` en vez de comparar dejaría pasar un estado que
 * el panel no sabe pintar, y por eso el `as` aquí es el error a evitar.
 *
 * `origin` no tiene ese problema: es un enum de Postgres, así que el tipo que
 * devuelve la fila ya es la unión y este schema no puede mentir sobre él.
 *
 * `delivery_status` es NOT NULL y comparte columna con el contacto, pero NO
 * quien lo mueve: ahí lo mueve `contact.service` cuando se entrega el correo de
 * aviso, y un reporte de errores no tiene camino de correo (D8: sin
 * notificación por ahora). Hoy nadie lo mueve después del insert —que la policy
 * obliga a que sea `PENDIENTE`—, así que un badge de entrega en este buzón no
 * significa "el equipo fue notificado" como en la bandeja de contactos.
 *
 * Deliberadamente AUSENTES: `reporter_id` (dato personal) e `images` (rutas de
 * un bucket privado). Los dos van en el detalle, no en la pantalla que se puede
 * ampliar en un monitor de soporte.
 */
export const BugReportListItemSchema = z.object({
	id: UuidSchema,
	state: z.enum(BUG_TRIAGE_STATES).nullable(),
	delivery_status: z.enum(CONTACT_DELIVERY_STATUSES),
	origin: z.enum(ENTRY_ORIGINS).nullable(),
	created_at: TimestamptzSchema,
	updated_at: TimestamptzSchema,
	readable: z.boolean(),
	summary: z.string().nullable(),
	/** Extracto para la tabla. El texto íntegro va en el detalle. */
	excerpt: z.string().nullable(),
});

/**
 * Detalle: el listado más el cuerpo del reporte, sus capturas y quién lo
 * mandó. A diferencia del `value`, aquí ausente y vacío colapsan en `null` y en
 * `[]`: el mapper de la API trabaja sobre filas ya parseadas y el panel necesita
 * una respuesta única, no "undefined donde no hay descripción".
 */
export const BugReportDetailSchema = BugReportListItemSchema.extend({
	description: z.string().nullable(),
	images: z.array(z.string()),
	reporter_id: z.string().nullable(),
	/** `value.at`: el momento exacto en que se escribió el reporte. */
	received_at: z.string().nullable(),
});

/**
 * Filtros del listado. NO lleva `namespace`: el endpoint está amarrado al
 * namespace `bug_report` en el servidor y no hay forma de que el cliente pida
 * la bandeja de contactos por este lado. `ListBugReportsQuerySchema` no es
 * `strict`, así que un `?namespace=contact` que llegue igual se descarta al
 * parsear, no se obedece.
 */
export const ListBugReportsQuerySchema = PaginationQuerySchema.extend({
	state: z.enum(BUG_TRIAGE_STATES).optional(),
	origin: z.enum(ENTRY_ORIGINS).optional(),
});

/**
 * Cuerpo del PATCH de triaje. Deliberadamente SOLO `state`: en un reporte de
 * errores NO hay quien mueva `delivery_status` — no hay camino de correo (D8) y
 * el insert lo deja en `PENDIENTE`, así que el badge de entrega no significa
 * "notificado" en esta bandeja. El porqué completo está en
 * `BugReportListItemSchema`, que es donde ese campo se lee; aquí solo importa
 * que el triaje no lo toque. Que el schema descarte la clave en vez de
 * aceptarla es lo que impide que el panel la use para fingir una entrega.
 */
export const SetBugReportStateSchema = z.object({
	state: z.enum(BUG_TRIAGE_STATES),
});

/** Cuerpo canónico del listado: `{ data: BugReportListItem[], meta }`. */
export const BugReportListResponseSchema = PaginatedDataSchema(
	BugReportListItemSchema,
);
