import { describe, expect, it } from "bun:test";
import {
	CreateReviewSchema,
	HideReviewSchema,
	ListReviewsForModerationQuerySchema,
	ReviewModerationItemSchema,
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
				hidden_reason: null,
			}).success,
		).toBe(true);
	});

	it("exige is_hidden: sin él la fila no entra en la bandeja", () => {
		const { is_hidden, ...sin_flag } = moderationRow;
		expect(is_hidden).toBe(true);
		expect(ReviewModerationItemSchema.safeParse(sin_flag).success).toBe(false);
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

describe("HideReviewSchema", () => {
	it("exige el motivo: es el registro de apelación", () => {
		expect(HideReviewSchema.safeParse({}).success).toBe(false);
		expect(HideReviewSchema.safeParse({ hidden_reason: "" }).success).toBe(
			false,
		);
	});

	it("no acepta un motivo que sea solo espacios", () => {
		expect(
			HideReviewSchema.safeParse({ hidden_reason: "   \n  " }).success,
		).toBe(false);
	});

	it("el cuerpo ausente también falla con el mensaje del campo", () => {
		const parsed = HideReviewSchema.safeParse({});
		expect(parsed.success).toBe(false);
		expect(parsed.error?.issues[0]?.message).toBe(
			"Escribe el motivo por el que se oculta la reseña",
		);
	});

	it("el motivo vacío y el de solo espacios dicen lo mismo, en español", () => {
		// El mensaje es copy de panel: el operador lo lee en el diálogo y en el
		// toast del 400, así que tiene que explicar por qué el campo no es
		// opcional y no limitarse a "Too small".
		for (const hidden_reason of ["", "   "]) {
			const parsed = HideReviewSchema.safeParse({ hidden_reason });
			expect(parsed.success).toBe(false);
			expect(parsed.error?.issues[0]?.message).toBe(
				"El motivo no puede estar vacío: es el registro de apelación",
			);
		}
	});

	it("acepta un motivo real y lo limpia de los bordes", () => {
		const parsed = HideReviewSchema.parse({
			hidden_reason: "  Abuse y amenazas  ",
		});
		expect(parsed.hidden_reason).toBe("Abuse y amenazas");
	});

	it("rechaza un motivo más largo que el check de la columna", () => {
		const parsed = HideReviewSchema.safeParse({
			hidden_reason: "a".repeat(501),
		});
		expect(parsed.success).toBe(false);
		expect(parsed.error?.issues[0]?.message).toBe(
			"El motivo no puede superar los 500 caracteres",
		);
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
});
