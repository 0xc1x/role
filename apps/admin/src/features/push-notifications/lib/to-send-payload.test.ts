import { describe, expect, it } from "bun:test";
import { sendDefaults } from "../forms/push-forms";
import { hasAudience, toSendPayload } from "./to-send-payload";

const UUID = "8f3a1c2e-4b5d-4e6f-8a9b-0c1d2e3f4a5b";

function baseValues() {
	return {
		...sendDefaults(),
		title: "Oferta relámpago",
		body: "Últimas unidades",
	};
}

describe("toSendPayload", () => {
	it("mapea título, cuerpo, tipo y audiencia", () => {
		const payload = toSendPayload({
			...baseValues(),
			include_user_ids: [UUID],
		});
		expect(payload).toMatchObject({
			title: "Oferta relámpago",
			body: "Últimas unidades",
			type: "announcement",
			include_user_ids: [UUID],
			segment_ids: [],
		});
	});

	it("mueve el link a data.link y omite data si está vacío", () => {
		const withLink = toSendPayload({
			...baseValues(),
			link: "/ofertas/1",
			include_user_ids: [UUID],
		}) as { data?: Record<string, unknown> };
		expect(withLink.data).toEqual({ link: "/ofertas/1" });

		const withoutLink = toSendPayload({
			...baseValues(),
			include_user_ids: [UUID],
		}) as { data?: Record<string, unknown> };
		expect(withoutLink.data).toBeUndefined();
	});

	it("rechaza sin segmentos ni usuarios", () => {
		expect(() => toSendPayload(baseValues())).toThrow();
	});
});

describe("hasAudience", () => {
	it("requiere segmentos o usuarios incluidos", () => {
		expect(hasAudience({ segment_ids: [], include_user_ids: [] })).toBe(false);
		expect(hasAudience({ segment_ids: [UUID], include_user_ids: [] })).toBe(
			true,
		);
		expect(hasAudience({ segment_ids: [], include_user_ids: [UUID] })).toBe(
			true,
		);
	});
});
