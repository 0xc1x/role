import { describe, expect, it } from "bun:test";
import {
	CategoryListResponseSchema,
	CategorySchema,
	CreateCategorySchema,
} from "../schemas/category.schema";

describe("CreateCategorySchema", () => {
	it("accepts valid category", () => {
		expect(
			CreateCategorySchema.safeParse({
				name: "Panadería",
				description: "Panes y repostería",
				emoji: "🥖",
				slug: "panaderia",
				image_url: null,
				active: true,
			}).success,
		).toBe(true);
	});

	it("rejects invalid slug", () => {
		expect(
			CreateCategorySchema.safeParse({
				name: "Panadería",
				description: "Desc",
				emoji: null,
				slug: "Invalid Slug",
				image_url: null,
				active: true,
			}).success,
		).toBe(false);
	});
});

describe("CategorySchema.active_count", () => {
	const base = {
		id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
		name: "Panadería",
		description: "Panes",
		emoji: "🥖",
		slug: "panaderia",
		image_url: null,
		active: true,
		created_at: "2026-01-01T00:00:00.000Z",
		updated_at: "2026-01-01T00:00:00.000Z",
		deleted_at: null,
	};

	it("acepta el conteo y 0", () => {
		// `0` es una respuesta real ("nadie tiene ofertas activas"), no una
		// ausencia: un chip que muestra "0 ofertas" es correcto.
		expect(
			CategorySchema.parse({ ...base, active_count: 7 }).active_count,
		).toBe(7);
		expect(
			CategorySchema.parse({ ...base, active_count: 0 }).active_count,
		).toBe(0);
	});

	it("es opcional: los reads de un recurso no corren el agregado", () => {
		expect(CategorySchema.parse(base).active_count).toBeUndefined();
	});

	it("rechaza null, negativos y no enteros", () => {
		// `null` significaría "no contamos", que es información distinta de 0.
		expect(
			CategorySchema.safeParse({ ...base, active_count: null }).success,
		).toBe(false);
		expect(
			CategorySchema.safeParse({ ...base, active_count: -1 }).success,
		).toBe(false);
		expect(
			CategorySchema.safeParse({ ...base, active_count: 1.5 }).success,
		).toBe(false);
	});
});

describe("CategoryListResponseSchema", () => {
	it("cada item puede traer active_count", () => {
		const item = {
			id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
			name: "Panadería",
			description: "Panes",
			emoji: "🥖",
			slug: "panaderia",
			image_url: null,
			active: true,
			created_at: "2026-01-01T00:00:00.000Z",
			updated_at: "2026-01-01T00:00:00.000Z",
			deleted_at: null,
			active_count: 3,
		};
		const parsed = CategoryListResponseSchema.parse({
			data: [item],
			meta: { page: 1, limit: 20, total: 1, total_pages: 1 },
		});
		expect(parsed.data[0]?.active_count).toBe(3);
	});
});
