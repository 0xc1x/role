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
import {
	REVIEW_MODERATION_REASON_NEEDS_DETAIL,
	REVIEW_MODERATION_REASONS,
} from "../enums/review-moderation.enum";

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
 * Motivo de moderación, validado contra la taxonomía declarada.
 *
 * Deliberadamente NO es un enum de Postgres: la columna es `text` para que la
 * taxonomía pueda crecer sin migración (ver `review-moderation.enum.ts`).
 */
export const ReviewModerationReasonSchema = z.enum(REVIEW_MODERATION_REASONS, {
	error: "Elige el motivo por el que se oculta la reseña",
});

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
	/**
	 * Token del motivo registrado. `z.string()` y NO el enum de la taxonomía, y
	 * la diferencia es deliberada: esta fila LEE la historia, y la historia
	 * contiene tokens que el contrato de hoy puede ya no conocer (un motivo
	 * retirado, o una fila escrita por una versión más nueva del panel). Tiparlo
	 * con el enum haría que una reseña moderada legítimamente en el pasado no
	 * entrara en la bandeja del operador que tiene que revisarla.
	 *
	 * Sobrevive al desocultamiento: es el registro de apelación.
	 */
	moderation_reason: z.string().nullable(),
	/**
	 * Detalle libre del motivo. OBLIGATORIO cuando el token es `other`; opcional
	 * para los demás. `null` es un valor legítimo: una razón nombrada ya se
	 * explica sola.
	 */
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
 *
 * `moderation_reason` SÍ va tipado con la taxonomía, al revés que el campo de la
 * fila: acá es una ENTRADA, no historia. Un filtro que aceptara tokens
 * desconocidos no filtraría por nada, y una URL guardada con un motivo que la
 * plataforma retiró tiene que fallar con un 400 explícito en vez de devolver una
 * bandeja que el operador creyó filtrada.
 */
export const ListReviewsForModerationQuerySchema = PaginationQuerySchema.extend(
	{
		visibility: z.enum(["all", "hidden", "visible"]).optional().default("all"),
		business_id: UuidSchema.optional(),
		rating: z.coerce.number().pipe(RatingSchema).optional(),
		moderation_reason: ReviewModerationReasonSchema.optional(),
	},
);

/** Copy del motivo ausente. Vive acá porque lo leen el panel y el toast del 400. */
const MENSAJE_MOTIVO_AUSENTE = "Elige el motivo por el que se oculta la reseña";

/** Copy del detalle que `other` no puede dejar vacío. */
const MENSAJE_DETALLE_OBLIGATORIO =
	"«Otro motivo» no se explica solo: describe por qué se oculta la reseña";

/**
 * El detalle libre, con sus reglas declaradas UNA vez: `.trim()` para que un
 * espacio no cuente como descripción, y el tope de 500 igual al `check` de la
 * columna.
 *
 * Es un schema y no una cadena para que el contrato y el formulario compartan
 * exactamente el mismo campo, con el mismo `.trim()` y el mismo tope.
 */
const HideReviewDetailSchema = z
	.string({ error: "Describe el motivo de la ocultación" })
	.trim()
	.max(500, "El detalle no puede superar los 500 caracteres");

/**
 * La regla condicional del detalle, expresada una vez y reutilizada por los dos
 * schemas de abajo.
 *
 * Que el contrato y el formulario la compartan no es un detalle: si el panel
 * tuviera su propia copia, el «Otro motivo» no se explica solo» del formulario y
 * el 400 del servidor podrían divergir sin que nada lo note, y el operador
 * vería un formulario más permisivo que la API.
 */
const detalleObligatorioPara = (
	value: { moderation_reason: string; hidden_reason?: string },
	ctx: z.core.$RefinementCtx,
) => {
	if (
		value.moderation_reason === REVIEW_MODERATION_REASON_NEEDS_DETAIL &&
		!value.hidden_reason
	) {
		// El issue lleva `path` para que el panel lo muestre BAJO el detalle y no
		// junto al selector: el error es de ese campo, no del motivo.
		ctx.addIssue({
			code: "custom",
			path: ["hidden_reason"],
			message: MENSAJE_DETALLE_OBLIGATORIO,
		});
	}
};

/**
 * Cuerpo de `PATCH /reviews/:id/hide`.
 *
 * `moderation_reason` es OBLIGATORIO y sale de la taxonomía declarada. Es el
 * registro de apelación: si el negocio disputa el ocultamiento, la respuesta a
 * "bajo qué política se retiró esto" no puede ser un campo opcional ni un texto
 * libre donde dos operadores pueden escribir lo mismo con palabras distintas.
 *
 * POR QUÉ `hidden_reason` ES OPCIONAL PARA UN MOTIVO NOMBRADO Y OBLIGATORIO PARA
 * `other`: los dos campos responden preguntas distintas. El token registra la
 * decisión —"se retiró por insultos y lenguaje de odio"— y eso ya es la
 * respuesta que la plataforma le debe al negocio que apela, aunque nadie escriba
 * una línea más. El texto libre es el contexto: qué dijo exactamente la persona,
 * a qué se refiere, por qué este caso y no otro. Exigirlo para todo obligaría al
 * operador a parafrasear el token, y esa paráfrasis es la que se vuelve ruido
 * cuando alguien lee mil filas. `other` es la excepción por definición: es el
 * token que NO dice nada, así que sin el detalle el registro vuelve a estar
 * vacío — que es exactamente lo que el resto del contrato existe para evitar.
 */
export const HideReviewSchema = z
	.object({
		moderation_reason: ReviewModerationReasonSchema,
		hidden_reason: HideReviewDetailSchema.optional(),
	})
	.superRefine(detalleObligatorioPara);

/**
 * "Todavía no se eligió motivo" en un formulario. NO es un token de la
 * taxonomía y nunca se guarda: es el estado en que arranca un selector, y no
 * puede ser `null` porque un `Select` distingue "sin valor" de "vacío" y un
 * formulario necesita un valor por defecto que se pueda resetear.
 *
 * Se exporta para que el panel use esta constante y no escriba `""` por su
 * cuenta: el string es lo que separa "sin elegir" de "elegido", y dos copias
 * literales de él son dos lugares donde esa diferencia puede desaparecer.
 */
export const SIN_MOTIVO = "";

/**
 * Variante del cuerpo para el formulario del panel.
 *
 * NO es otro contrato: son las MISMAS reglas con la forma que tiene el estado de
 * un formulario. Dos diferencias, y solo dos:
 *
 *  - `moderation_reason` acepta `SIN_MOTIVO` (la cadena vacía) porque un selector
 *    arranca sin elección, y aun así la rechaza al validar: "todavía no eligió"
 *    no es un motivo, y dejarlo pasar produciría el registro de apelación vacío
 *    que el resto del contrato existe para evitar.
 *  - `hidden_reason` es siempre un `string` y no opcional, porque un campo de
 *    texto siempre tiene un valor; el panel traduce `""` a ausencia antes de
 *    mandar el PATCH.
 *
 * Vive acá y no en el panel, igual que `CreateSlideFormSchema`: las reglas y su
 * copy se declaran una vez, y el panel no reimplementa el `.trim()`, el tope ni la
 * condición de `other`.
 */
export const HideReviewFormSchema = z
	.object({
		moderation_reason: z
			.union([z.literal(SIN_MOTIVO), ReviewModerationReasonSchema], {
				error: MENSAJE_MOTIVO_AUSENTE,
			})
			.refine((value) => value !== SIN_MOTIVO, {
				error: MENSAJE_MOTIVO_AUSENTE,
			}),
		hidden_reason: HideReviewDetailSchema,
	})
	.superRefine(detalleObligatorioPara);

export const ReviewModerationListResponseSchema = PaginatedDataSchema(
	ReviewModerationItemSchema,
);
