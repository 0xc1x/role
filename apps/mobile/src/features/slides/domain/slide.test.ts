import { describe, expect, test } from "bun:test";
import { isInValidityWindow, toPromoSlide } from "@/features/slides/domain/slide";

describe("toPromoSlide", () => {
	test("mapea y marca sponsor", () => {
		const slide = toPromoSlide({
			id: "s1",
			title: "T",
			caption: "C",
			badge_text: null,
			cta_label: "Ver",
			redirect_url: null,
			coupon_code: null,
			image_url: null,
			text_color: null,
			button_color: null,
			type: "sponsor",
			priority: 1,
			active: true,
			start_at: null,
			end_at: null,
		});
		expect(slide.isSponsored).toBe(true);
		expect(slide.ctaLabel).toBe("Ver");
		expect(toPromoSlide({ ...slide, type: "info" } as never).isSponsored).toBe(false);
	});
});

describe("isInValidityWindow", () => {
	const now = new Date("2025-06-01T12:00:00Z");
	test("sin ventana → válida", () => {
		expect(isInValidityWindow({ start_at: null, end_at: null }, now)).toBe(true);
	});
	test("futura/pasada → inválida", () => {
		expect(
			isInValidityWindow({ start_at: "2025-07-01T00:00:00Z", end_at: null }, now),
		).toBe(false);
		expect(
			isInValidityWindow({ start_at: null, end_at: "2025-05-01T00:00:00Z" }, now),
		).toBe(false);
		expect(
			isInValidityWindow(
				{ start_at: "2025-05-01T00:00:00Z", end_at: "2025-07-01T00:00:00Z" },
				now,
			),
		).toBe(true);
	});
});
