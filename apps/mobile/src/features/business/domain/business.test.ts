import { describe, expect, test } from "bun:test";
import {
	BUSINESS_TYPE_LABELS,
	DEFAULT_BUSINESS_NOTIFICATION_PREFS,
	PAYOUT_STATUS_LABELS,
	filterBusinessReviews,
	type BusinessReviewView,
} from "@/features/business/domain/business";

function review(partial: Partial<BusinessReviewView>): BusinessReviewView {
	return {
		id: partial.id ?? "r",
		userName: partial.userName ?? "Cliente",
		productRating: partial.productRating ?? 0,
		businessRating: partial.businessRating ?? 0,
		date: partial.date ?? "2026-01-01T00:00:00Z",
		comment: partial.comment ?? null,
	};
}

describe("business domain constants", () => {
	test("labels cubren tipos y estados", () => {
		expect(BUSINESS_TYPE_LABELS.bakery).toBe("Panadería");
		expect(PAYOUT_STATUS_LABELS.paid).toBe("Pagado");
		expect(DEFAULT_BUSINESS_NOTIFICATION_PREFS.push_enabled).toBe(true);
	});
});

describe("filterBusinessReviews", () => {
	const reviews = [
		review({ id: "a", productRating: 3, businessRating: 4, date: "2026-03-01T00:00:00Z" }),
		review({ id: "b", productRating: 5, businessRating: 5, date: "2026-01-01T00:00:00Z" }),
		review({ id: "c", productRating: 2, businessRating: 1, date: "2026-02-01T00:00:00Z" }),
		review({ id: "d", productRating: 5, businessRating: 3, date: "2025-12-01T00:00:00Z" }),
	];

	test("recent ordena por fecha descendente sin filtrar", () => {
		expect(filterBusinessReviews(reviews, "recent").map((r) => r.id)).toEqual([
			"a",
			"c",
			"b",
			"d",
		]);
	});

	test("recommended conserva solo promedio >= 4, mejor puntuadas primero", () => {
		// b: 5.0, d: 4.0; a: 3.5 y c: 1.5 quedan fuera.
		expect(filterBusinessReviews(reviews, "recommended").map((r) => r.id)).toEqual([
			"b",
			"d",
		]);
	});

	test("empate en promedio se resuelve por fecha más reciente", () => {
		const tied = [
			review({ id: "old", productRating: 5, businessRating: 3, date: "2025-01-01T00:00:00Z" }),
			review({ id: "new", productRating: 4, businessRating: 4, date: "2026-06-01T00:00:00Z" }),
		];
		expect(filterBusinessReviews(tied, "recommended").map((r) => r.id)).toEqual([
			"new",
			"old",
		]);
	});
});
