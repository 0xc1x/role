import { z } from "zod";
import {
	PaginatedDataSchema,
	PaginationQuerySchema,
} from "../../_common/schemas/api.schema";
import {
	RatingSchema,
	TimestamptzSchema,
	UuidSchema,
} from "../../_common/schemas/common";

export const ReviewSchema = z.object({
	id: UuidSchema,
	user_id: UuidSchema,
	business_id: UuidSchema,
	order_id: UuidSchema.nullable(),
	rating: RatingSchema.nullable(),
	comment: z.string().nullable(),
	product_rating: RatingSchema.nullable(),
	business_rating: RatingSchema.nullable(),
	created_at: TimestamptzSchema,
	updated_at: TimestamptzSchema,
});

export const CreateReviewSchema = z.object({
	user_id: UuidSchema,
	business_id: UuidSchema,
	order_id: UuidSchema.nullable().optional(),
	rating: RatingSchema.nullable().optional(),
	comment: z.string().nullable().optional(),
	product_rating: RatingSchema.nullable().optional(),
	business_rating: RatingSchema.nullable().optional(),
});

export const UpdateReviewSchema = z
	.object({
		rating: RatingSchema.nullable(),
		comment: z.string().nullable(),
		product_rating: RatingSchema.nullable(),
		business_rating: RatingSchema.nullable(),
	})
	.partial();

/**
 * Request del endpoint `POST /reviews` (API): user_id y business_id los
 * deriva el server a partir de la orden, el cliente nunca los envía.
 */
export const CreateReviewRequestSchema = z.object({
	order_id: UuidSchema,
	comment: z.string().max(2000).nullable().optional(),
	product_rating: RatingSchema.nullable().optional(),
	business_rating: RatingSchema.nullable().optional(),
});

// ─── Moderación (solo panel admin) ───────────────────────────────────

/**
 * Fila de la bandeja de moderación: la reseña más su estado de moderación.
 *
 * Extiende `ReviewSchema` en vez de abrir un schema paralelo para que la
 * operación de moderación tenga a mano lo mismo que muestra la tabla (rating,
 * comentario, negocio, autor) sin volver a declararlo.
 *
 * POR QUÉ `ReviewSchema` NO GANA ESTOS CAMPOS: es la proyección pública. Si el
 * DTO que devuelve `POST /reviews` —y que el móvil lee— llevara `is_hidden`
 * junto al resto, bastaría un `select` de más para que la app le dijera a una
 * persona que su reseña está oculta sin que la plataforma lo haya decidido. La
 * moderación se decide en el panel y se refleja en la política de lectura, no en
 * un campo que cada cliente puede leer a su antojo.
 *
 * `moderated_by` viaja como uuid PORQUE ES TODO LO QUE HAY: `profiles` no guarda
 * un "nombre de moderador". El campo `moderated_by_name` existe para que el
 * operador no tenga que mirar un uuid, y es `null` cuando la cuenta se borró
 * (`ON DELETE SET NULL`) o cuando la reseña nunca se moderó — en ese caso la
 * ausencia de nombre significa algo, y por eso no se sustituye por un texto
 * inventado.
 */
export const ReviewModerationItemSchema = ReviewSchema.extend({
	is_hidden: z.boolean(),
	moderated_at: TimestamptzSchema.nullable(),
	moderated_by: UuidSchema.nullable(),
	/** Nombre del admin que moderó; `null` si la cuenta ya no existe. */
	moderated_by_name: z.string().nullable(),
	/** Motivo registrado. Sobrevive al desocultamiento: es el registro de apelación. */
	hidden_reason: z.string().nullable(),
	/** Autor de la reseña. `null` si el perfil se borró (la reseña, no: es CASCADE). */
	author_name: z.string().nullable(),
	business_name: z.string().nullable(),
});

/**
 * Filtros de la bandeja. `visibility` es un enum de tres estados y no un
 * booleano porque "sin filtro" y "ocultas" tienen que ser distinguibles en la URL
 * de la tabla: un `is_hidden` opcional no puede expresar las tres y el panel
 * acaba guardando el filtro en estado local, que es donde se pierde al recargar.
 */
export const ListReviewsForModerationQuerySchema = PaginationQuerySchema.extend(
	{
		visibility: z.enum(["all", "hidden", "visible"]).optional().default("all"),
		business_id: UuidSchema.optional(),
		rating: z.coerce.number().pipe(RatingSchema).optional(),
	},
);

/**
 * Cuerpo de `PATCH /reviews/:id/hide`.
 *
 * El motivo es OBLIGATO, y no por cortesía: es el registro de apelación. Si el
 * negocio disputa el ocultamiento, la respuesta a "por qué" no puede ser un
 * campo opcional. `.trim()` para que un espacio no cuente como motivo, y el
 * tope de 500 igual al `check` de la columna.
 */
export const HideReviewSchema = z.object({
	hidden_reason: z
		.string({ error: "Escribe el motivo por el que se oculta la reseña" })
		.trim()
		.min(1, "El motivo no puede estar vacío: es el registro de apelación")
		.max(500, "El motivo no puede superar los 500 caracteres"),
});

export const ReviewModerationListResponseSchema = PaginatedDataSchema(
	ReviewModerationItemSchema,
);
