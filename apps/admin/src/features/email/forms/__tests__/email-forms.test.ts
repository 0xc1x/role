import { describe, expect, test } from "bun:test";
import {
	componentDefaults,
	segmentDefaults,
	templateDefaults,
} from "../email-forms";

describe("templateDefaults", () => {
	test("vacío y desde plantilla", () => {
		expect(templateDefaults()).toMatchObject({
			name: "",
			is_active: true,
			variables: [],
		});
		expect(
			templateDefaults({
				name: "N",
				subject: "S",
				body_html: "B",
				header_id: "h",
				footer_id: null,
				variables: ["x"],
				is_active: false,
			} as never),
		).toMatchObject({
			name: "N",
			header_id: "h",
			variables: ["x"],
			is_active: false,
		});
	});
});

describe("segmentDefaults", () => {
	test("vacío y desde segmento", () => {
		expect(segmentDefaults()).toMatchObject({
			type: "dynamic",
			category: "announcements",
		});
		expect(
			segmentDefaults({
				name: "V",
				type: "static",
				filters: null,
				category: "news",
				is_active: true,
			} as never).filtersJson,
		).toBe("");
	});
});

describe("componentDefaults", () => {
	test("vacío y desde componente", () => {
		expect(componentDefaults()).toMatchObject({
			type: "header",
			is_active: true,
		});
		expect(
			componentDefaults({
				name: "F",
				type: "footer",
				html_content: "<p>x</p>",
			} as never),
		).toMatchObject({ type: "footer", html_content: "<p>x</p>" });
	});
});
