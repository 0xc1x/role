import { describe, expect, it } from "bun:test";
import {
	ListReviewsFeedQuerySchema,
	MyReviewItemSchema,
	OfferReviewItemSchema,
	PublicReviewItemSchema,
} from "../schemas/review-feed.schema";

const uuid = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

const publicReview = {
	id: uuid,
	business_id: uuid,
	order_id: uuid,
	product_rating: 4,
	business_rating: 5,
	comment: "Excelente pan",
	created_at: "2026-01-01T00:00:00.000Z",
	updated_at: "2026-01-01T00:00:00.000Z",
	author_name: "Ana",
	author_id: uuid,
};

describe("PublicReviewItemSchema", () => {
	it("accepts a feed row and tolerates a deleted author or legacy order", () => {
		expect(PublicReviewItemSchema.safeParse(publicReview).success).toBe(true);
		expect(
			PublicReviewItemSchema.safeParse({
				...publicReview,
				order_id: null,
				author_name: null,
				comment: null,
				product_rating: null,
				business_rating: null,
			}).success,
		).toBe(true);
	});

	it("exposes no moderation field and no duplicate user id", () => {
		const parsed = PublicReviewItemSchema.safeParse({
			...publicReview,
			user_id: uuid,
			is_hidden: false,
			moderated_at: null,
			moderated_by: null,
			moderation_reason: "abuse",
			hidden_reason: "texto libre escrito por el personal",
		});
		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		for (const key of [
			"user_id",
			"is_hidden",
			"moderated_at",
			"moderated_by",
			"moderation_reason",
			"hidden_reason",
		]) {
			expect(Object.keys(parsed.data)).not.toContain(key);
		}
		expect(parsed.data.author_id).toBe(uuid);
	});

	it("carries no offer field, because the business feed cannot resolve one", () => {
		const parsed = PublicReviewItemSchema.safeParse({
			...publicReview,
			offer_id: uuid,
			offer_title: "Pack",
		});
		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(Object.keys(parsed.data)).not.toContain("offer_id");
	});

	it("rejects a rating outside 1..5", () => {
		expect(
			PublicReviewItemSchema.safeParse({ ...publicReview, product_rating: 6 })
				.success,
		).toBe(false);
	});
});

describe("OfferReviewItemSchema", () => {
	it("requires a resolved offer, since the join guarantees one", () => {
		expect(
			OfferReviewItemSchema.safeParse({
				...publicReview,
				offer_id: uuid,
				offer_title: "Pack sorpresa",
			}).success,
		).toBe(true);
		expect(OfferReviewItemSchema.safeParse({ ...publicReview }).success).toBe(
			false,
		);
	});
});

describe("MyReviewItemSchema", () => {
	it("adds exactly is_hidden to the public row", () => {
		const parsed = MyReviewItemSchema.safeParse({
			...publicReview,
			is_hidden: true,
		});
		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(Object.keys(parsed.data)).toContain("is_hidden");
		expect(Object.keys(parsed.data)).not.toContain("moderation_reason");
	});
});

describe("ListReviewsFeedQuerySchema", () => {
	it("is pagination only, and drops any attempt to filter", () => {
		expect(ListReviewsFeedQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
		const parsed = ListReviewsFeedQuerySchema.parse({
			business_id: uuid,
			visibility: "all",
		});
		// The scope is part of the path, not a filter: a filter would be an AND
		// on top of the index that serves the feed.
		expect(parsed).toEqual({ page: 1, limit: 20 });
	});
});
