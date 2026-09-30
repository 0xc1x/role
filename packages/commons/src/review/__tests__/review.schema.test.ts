import { describe, expect, it } from "bun:test";
import {
	isReviewModerationReason,
	REVIEW_MODERATION_REASON_LABELS,
	REVIEW_MODERATION_REASON_NEEDS_DETAIL,
	REVIEW_MODERATION_REASONS,
} from "../enums/review-moderation.enum";
import {
	CreateReviewSchema,
	HideReviewFormSchema,
	HideReviewSchema,
	ListReviewsForModerationQuerySchema,
	ReviewModerationItemSchema,
	SIN_MOTIVO,
	ReviewModerationReasonSchema,
	ReviewSchema,
} from "../schemas/review.schema";

const uuid = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

describe("CreateReviewSchema", () => {
	it("accepts minimal review", () => {
		expect(
			CreateReviewSchema.safeParse({
				user_id: uuid,
				business_id: uuid,
			}).success,
		).toBe(true);
	});

	it("rejects invalid user_id", () => {
		expect(
			CreateReviewSchema.safeParse({
				user_id: "bad",
				business_id: uuid,
			}).success,
		).toBe(false);
	});
});

describe("ReviewSchema (proyección pública)", () => {
	it("NO expone el estado de moderación", () => {
		// Si la proyección pública creciera con is_hidden, el DTO de
		// `POST /reviews` —que es el que lee el móvil— llevaría el estado de
		// moderación y cualquier `select` de más se lo mostraría al usuario. El
		// estado vive en ReviewModerationItemSchema.
		const review = ReviewSchema.safeParse({
			id: uuid,
			user_id: uuid,
			business_id: uuid,
			order_id: null,
			rating: null,
			comment: null,
			product_rating: 4,
			business_rating: 5,
			created_at: "2026-09-27T00:00:00+00:00",
			updated_at: "2026-09-27T00:00:00+00:00",
		});
		expect(review.success).toBe(true);
		expect(review.data).not.toHaveProperty("is_hidden");
		expect(review.data).not.toHaveProperty("hidden_reason");
		expect(review.data).not.toHaveProperty("moderation_reason");
	});

	it("descarta is_hidden si alguien lo manda igual (zod no es strict)", () => {
		const parsed = ReviewSchema.parse({
			id: uuid,
			user_id: uuid,
			business_id: uuid,
			order_id: null,
			rating: null,
			comment: "buena",
			product_rating: null,
			business_rating: null,
			created_at: "2026-09-27T00:00:00+00:00",
			updated_at: "2026-09-27T00:00:00+00:00",
			is_hidden: true,
			hidden_reason: "abusiva",
		});
		expect(parsed).not.toHaveProperty("is_hidden");
	});
});

const moderationRow = {
	id: uuid,
	user_id: uuid,
	business_id: uuid,
	order_id: null,
	rating: 1,
	comment: "Pésimo",
	product_rating: 1,
	business_rating: 1,
	created_at: "2026-09-27T00:00:00+00:00",
	updated_at: "2026-09-27T00:00:00+00:00",
	is_hidden: true,
	moderated_at: "2026-09-27T01:00:00+00:00",
	moderated_by: uuid,
	moderated_by_name: "Ana moderation",
	moderation_reason: "insults_or_hate_speech",
	hidden_reason: "Lenguaje abusivo hacia el personal",
	author_name: "Bruno",
	business_name: "Panadería Sur",
};

describe("ReviewModerationItemSchema", () => {
	it("acepta una reseña moderada con motivo y moderador", () => {
		expect(ReviewModerationItemSchema.safeParse(moderationRow).success).toBe(
			true,
		);
	});

	it("acepta una reseña nunca moderada (todo nullable)", () => {
		expect(
			ReviewModerationItemSchema.safeParse({
				...moderationRow,
				is_hidden: false,
				moderated_at: null,
				moderated_by: null,
				moderated_by_name: null,
				moderation_reason: null,
				hidden_reason: null,
			}).success,
		).toBe(true);
	});

	it("acepta una fila oculta cuyo token ya no está en el contrato", () => {
		// El caso que hace que este campo sea `z.string()` y no el enum: la
		// taxonomía evoluciona (un motivo se retira, o la fila la escribió una
		// versión más nueva del panel). Si la fila no entrara en la bandeja, el
		// operador no podría revisar la moderación que tiene que responder.
		const parsed = ReviewModerationItemSchema.safeParse({
			...moderationRow,
			moderation_reason: "motivo_retirado_del_contrato",
		});
		expect(parsed.success).toBe(true);
	});

	it("acepta una fila oculta sin detalle: un motivo nombrado ya se explica", () => {
		expect(
			ReviewModerationItemSchema.safeParse({
				...moderationRow,
				hidden_reason: null,
			}).success,
		).toBe(true);
	});

	it("exige is_hidden: sin él la fila no entra en la bandeja", () => {
		const { is_hidden, ...sin_flag } = moderationRow;
		expect(is_hidden).toBe(true);
		expect(ReviewModerationItemSchema.safeParse(sin_flag).success).toBe(false);
	});

	it("exige moderation_reason: una fila moderada sin motivo no se puede revisar", () => {
		const { moderation_reason, ...sin_motivo } = moderationRow;
		expect(moderation_reason).toBe("insults_or_hate_speech");
		expect(ReviewModerationItemSchema.safeParse(sin_motivo).success).toBe(
			false,
		);
	});

	it("rechaza un moderated_by que no es uuid", () => {
		expect(
			ReviewModerationItemSchema.safeParse({
				...moderationRow,
				moderated_by: "no-soy-un-uuid",
			}).success,
		).toBe(false);
	});
});

describe("la taxonomía de motivos", () => {
	it("cubre las causas de retiro que la plataforma se reserva", () => {
		// El conjunto NO es decorativo: es la reserva de la plataforma de
		// withdrawing contenido que no cumple sus políticas. Si un motivo
		// desapareciera, esta lista es la que lo denuncia.
		expect(REVIEW_MODERATION_REASONS).toEqual([
			"off_topic_or_automated",
			"insults_or_hate_speech",
			"identity_discrimination",
			"threats_or_intimidation",
			"third_party_personal_data",
			"unsolicited_promotion",
			"sexual_content_or_violence",
			"fake_or_unverified_purchase",
			"other",
		]);
	});

	it("cada motivo tiene etiqueta en español, y ninguna está vacía", () => {
		// El `Record` sobre el tipo del token ya obliga a que existan todas; esto
		// impide que exista una etiqueta en blanco, que el selector renderizaría
		// como una opción sin nombre.
		for (const reason of REVIEW_MODERATION_REASONS) {
			const label = REVIEW_MODERATION_REASON_LABELS[reason];
			expect(label).toBeString();
			expect(label.trim().length).toBeGreaterThan(0);
		}
	});

	it("los tokens no tienen espacios ni acentos: son los que se guardan", () => {
		// La etiqueta es copy y puede cambiar; el token es lo que queda escrito en
		// la fila y en la URL del filtro. Un token con espacios rompería el
		// `toSearchParams` del panel y el filtro de la API.
		for (const reason of REVIEW_MODERATION_REASONS) {
			expect(reason).toMatch(/^[a-z0-9_]+$/);
		}
	});

	it("«other» es el único que no se explica solo, y está en la taxonomía", () => {
		expect(REVIEW_MODERATION_REASON_NEEDS_DETAIL).toBe("other");
		expect(REVIEW_MODERATION_REASONS).toContain(
			REVIEW_MODERATION_REASON_NEEDS_DETAIL,
		);
		// Si alguien lo cambiara por un motivo que SÍ se explica solo, el detalle
		// dejaría de ser obligatorio para el caso que más lo necesita.
		expect(
			REVIEW_MODERATION_REASONS.filter(
				(r) => r === REVIEW_MODERATION_REASON_NEEDS_DETAIL,
			),
		).toHaveLength(1);
	});

	it("el schema acepta todos los tokens y rechaza lo que no está en la lista", () => {
		for (const reason of REVIEW_MODERATION_REASONS) {
			expect(ReviewModerationReasonSchema.safeParse(reason).success).toBe(true);
		}
		// Sin listing en la base: acá es donde la taxonomía es real, y por eso un
		// token desconocido es un 400 explícito y no una fila guardada.
		expect(
			ReviewModerationReasonSchema.safeParse("me_gustó_poco").success,
		).toBe(false);
		expect(ReviewModerationReasonSchema.safeParse("").success).toBe(false);
	});
});

describe("HideReviewSchema", () => {
	it("exige el motivo de la taxonomía: es el registro de apelación", () => {
		expect(HideReviewSchema.safeParse({}).success).toBe(false);
		expect(HideReviewSchema.safeParse({ hidden_reason: "Abuso" }).success).toBe(
			false,
		);
		expect(
			HideReviewSchema.safeParse({ moderation_reason: "me_gustó_poco" })
				.success,
		).toBe(false);
	});

	it("el cuerpo ausente falla con el mensaje del selector, en español", () => {
		const parsed = HideReviewSchema.safeParse({});
		expect(parsed.success).toBe(false);
		expect(parsed.error?.issues[0]?.message).toBe(
			"Elige el motivo por el que se oculta la reseña",
		);
	});

	it("acepta un motivo nombrado SIN detalle: el token ya dice por qué", () => {
		// Esta es la regla que hace el flujo usable: un motivo declarado se
		// explica solo y el operador no tiene que parafrasearlo en un campo de
		// texto que después nadie lee.
		const parsed = HideReviewSchema.parse({
			moderation_reason: "insults_or_hate_speech",
		});
		expect(parsed.moderation_reason).toBe("insults_or_hate_speech");
		expect(parsed.hidden_reason).toBeUndefined();
	});

	it("acepta un motivo nombrado CON detalle: el texto es contexto, y se guarda", () => {
		const parsed = HideReviewSchema.parse({
			moderation_reason: "threats_or_intimidation",
			hidden_reason: "  Mencionó llegar al local el jueves  ",
		});
		expect(parsed.hidden_reason).toBe("Mencionó llegar al local el jueves");
	});

	it("«other» SIN detalle falla: un token que no dice nada no es un motivo", () => {
		for (const hidden_reason of [undefined, "", "   ", "\n\t "]) {
			const parsed = HideReviewSchema.safeParse({
				moderation_reason: REVIEW_MODERATION_REASON_NEEDS_DETAIL,
				hidden_reason,
			});
			expect(parsed.success).toBe(false);
			expect(parsed.error?.issues[0]?.message).toBe(
				"«Otro motivo» no se explica solo: describe por qué se oculta la reseña",
			);
		}
	});

	it("el error de «other» cae en el detalle, no en el motivo", () => {
		// El panel muestra el error bajo el campo al que pertenece; Mandarlo al
		// selector haría que el operador cambiara de motivo un campo que ya está
		// bien, y volvería a «other» sin entender qué falta.
		const parsed = HideReviewSchema.safeParse({
			moderation_reason: "other",
		});
		expect(parsed.error?.issues[0]?.path).toEqual(["hidden_reason"]);
	});

	it("«other» CON detalle pasa", () => {
		const parsed = HideReviewSchema.parse({
			moderation_reason: "other",
			hidden_reason: "Contenido sobre un tema que no es del negocio",
		});
		expect(parsed.hidden_reason).toBe(
			"Contenido sobre un tema que no es del negocio",
		);
	});

	it("rechaza un detalle más largo que el check de la columna", () => {
		const parsed = HideReviewSchema.safeParse({
			moderation_reason: "insults_or_hate_speech",
			hidden_reason: "a".repeat(501),
		});
		expect(parsed.success).toBe(false);
		expect(parsed.error?.issues[0]?.message).toBe(
			"El detalle no puede superar los 500 caracteres",
		);
	});

	it("el tope de longitud aplica también a «other» con detalle largo", () => {
		expect(
			HideReviewSchema.safeParse({
				moderation_reason: "other",
				hidden_reason: "a".repeat(501),
			}).success,
		).toBe(false);
	});
});

describe("HideReviewFormSchema (el mismo contrato, con la forma de un formulario)", () => {
	it("rechaza el motivo sin elegir: un selector vacío no es un motivo", () => {
		// Este es el ÚNICO cambio respecto del contrato, y va en la dirección
		// segura: el estado "todavía no eligió" se RECHAZA, no se acepta como
		// motivo. Aceptarlo produciría el registro de apelación vacío.
		const parsed = HideReviewFormSchema.safeParse({
			moderation_reason: SIN_MOTIVO,
			hidden_reason: "",
		});
		expect(parsed.success).toBe(false);
		expect(parsed.error?.issues[0]?.message).toBe(
			"Elige el motivo por el que se oculta la reseña",
		);
	});

	it("el motivo sigue siendo obligatorio aunque el detalle sea una cadena", () => {
		expect(
			HideReviewFormSchema.safeParse({ hidden_reason: "Abuso" }).success,
		).toBe(false);
	});

	it("acepta un motivo nombrado con el detalle vacío del formulario", () => {
		// Un `textarea` siempre tiene un valor: "" es "no escribió", que es un
		// dato válido del formulario. El panel lo traduce a ausencia antes del
		// PATCH; el schema no puede exigir algo que el campo nunca va a tener.
		const parsed = HideReviewFormSchema.parse({
			moderation_reason: "identity_discrimination",
			hidden_reason: "",
		});
		expect(parsed.moderation_reason).toBe("identity_discrimination");
		expect(parsed.hidden_reason).toBe("");
	});

	it("«other» con el detalle vacío también falla: el guard mira el string", () => {
		const parsed = HideReviewFormSchema.safeParse({
			moderation_reason: "other",
			hidden_reason: "",
		});
		expect(parsed.success).toBe(false);
		expect(parsed.error?.issues[0]?.message).toBe(
			"«Otro motivo» no se explica solo: describe por qué se oculta la reseña",
		);
	});

	it("«other» con detalle y con espacios alrededor pasa y limpia los bordes", () => {
		const parsed = HideReviewFormSchema.parse({
			moderation_reason: "other",
			hidden_reason: "  Habla de un producto que el local no vende  ",
		});
		expect(parsed.hidden_reason).toBe(
			"Habla de un producto que el local no vende",
		);
	});

	it("comparte el `.trim()`, el tope y el copy con el contrato", () => {
		// Las dos schemas tienen que decir lo mismo. Si el formulario fuera más
		// permisivo, el operador vería un formulario que acepta algo que la API
		// va a rechazar con un 400.
		const demasiadoLargo = "a".repeat(501);
		for (const schema of [HideReviewSchema, HideReviewFormSchema]) {
			const parsed = schema.safeParse({
				moderation_reason: "insults_or_hate_speech",
				hidden_reason: demasiadoLargo,
			});
			expect(parsed.success).toBe(false);
			expect(parsed.error?.issues[0]?.message).toBe(
				"El detalle no puede superar los 500 caracteres",
			);
		}
	});
});

describe("isReviewModerationReason", () => {
	it("acepta todos los tokens de la taxonomía y nada más", () => {
		for (const reason of REVIEW_MODERATION_REASONS) {
			expect(isReviewModerationReason(reason)).toBe(true);
		}
		expect(isReviewModerationReason(SIN_MOTIVO)).toBe(false);
		expect(isReviewModerationReason("me_gustó_poco")).toBe(false);
	});

	it("no es el validador: no lanza, solo responde", () => {
		// La función responde "¿es un token?", no "¿es un motivo válido para esta
		// acción?". Quien valida es `HideReviewSchema`, con su mensaje.
		expect(isReviewModerationReason("")).toBe(false);
	});
});

describe("ListReviewsForModerationQuerySchema", () => {
	it("por defecto pagina y no filtra por visibilidad", () => {
		const parsed = ListReviewsForModerationQuerySchema.parse({});
		expect(parsed).toEqual({ page: 1, limit: 20, visibility: "all" });
	});

	it("rechaza una visibilidad que no existe", () => {
		expect(
			ListReviewsForModerationQuerySchema.safeParse({
				visibility: "ocultas",
			}).success,
		).toBe(false);
	});

	it("coercea el rating de query a número y lo limita a 1..5", () => {
		expect(ListReviewsForModerationQuerySchema.parse({ rating: "3" })).toEqual({
			page: 1,
			limit: 20,
			visibility: "all",
			rating: 3,
		});
		expect(
			ListReviewsForModerationQuerySchema.safeParse({ rating: "6" }).success,
		).toBe(false);
		expect(
			ListReviewsForModerationQuerySchema.safeParse({ rating: "dos" }).success,
		).toBe(false);
	});

	it("filtra por negocio con un uuid válido", () => {
		expect(
			ListReviewsForModerationQuerySchema.parse({ business_id: uuid })
				.business_id,
		).toBe(uuid);
		expect(
			ListReviewsForModerationQuerySchema.safeParse({ business_id: "x" })
				.success,
		).toBe(false);
	});

	it("filtra por motivo de la taxonomía y rechaza lo que no está en ella", () => {
		// El filtro es una ENTRADA, a diferencia del `moderation_reason` de la
		// fila: tipado estricto a propósito. Un motivo desconocido en la URL tiene
		// que dar 400 y no devolver una bandeja que el operador creyó filtrada.
		expect(
			ListReviewsForModerationQuerySchema.parse({
				moderation_reason: "identity_discrimination",
			}).moderation_reason,
		).toBe("identity_discrimination");
		expect(
			ListReviewsForModerationQuerySchema.safeParse({
				moderation_reason: "no_existe",
			}).success,
		).toBe(false);
	});

	it("sin filtro de motivo no lo agrega a la query", () => {
		expect(
			ListReviewsForModerationQuerySchema.parse({}).moderation_reason,
		).toBeUndefined();
	});
});
