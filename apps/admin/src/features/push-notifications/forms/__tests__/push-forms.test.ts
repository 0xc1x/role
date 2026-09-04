import { describe, expect, test } from "bun:test";
import { pushTemplateDefaults, sendDefaults } from "../push-forms";

describe("pushTemplateDefaults", () => {
	test("defaults vacíos sin plantilla", () => {
		expect(pushTemplateDefaults()).toEqual({
			name: "",
			title: "",
			body: "",
			link: "",
			is_active: true,
		});
	});

	test("rellena desde plantilla", () => {
		expect(
			pushTemplateDefaults({
				name: "N",
				title: "T",
				body: "B",
				data: { link: "/ofertas" },
				is_active: false,
			} as never),
		).toEqual({
			name: "N",
			title: "T",
			body: "B",
			link: "/ofertas",
			is_active: false,
		});
	});
});

describe("sendDefaults", () => {
	test("valores iniciales del form de envío", () => {
		expect(sendDefaults()).toEqual({
			template_id: "",
			title: "",
			body: "",
			type: "announcement",
			link: "",
			segment_ids: [],
			include_user_ids: [],
			exclude_user_ids: [],
		});
	});
});
