import { describe, expect, test } from "bun:test";
import { getConfigValue } from "@0xc1x/role-commons";

import { strings } from "@/src/core/i18n/strings";
import { buildControllerIdentity } from "./operator-identity";

describe("operator identity from app_config", () => {
	test("terms template uses placeholder, no hardcoded RUC", () => {
		expect(strings.termsScreen.sections[0].content).toContain(
			"{controllerIdentity}",
		);
		expect(strings.termsScreen.sections[0].content).not.toContain(
			"1799999999001",
		);
	});

	test("privacy template uses placeholder, no hardcoded RUC", () => {
		expect(strings.privacyScreen.sections[0].content).toContain(
			"{controllerIdentity}",
		);
		expect(strings.privacyScreen.sections[0].content).not.toContain(
			"1799999999001",
		);
	});

	test("support phone fallback is EC placeholder", () => {
		expect(strings.helpCenter.supportPhone).toBe("+593 99 000 0000");
	});

	test("fallback never blocks without config data", () => {
		// Sin datos de config (offline / is_public=false) devuelve el fallback.
		expect(getConfigValue(undefined, "legal.ruc", "")).toBe("");
		expect(getConfigValue(undefined, "support.phone", "+593 99 000 0000")).toBe(
			"+593 99 000 0000",
		);
	});

	test("empty ruc hides the RUC fragment", () => {
		const identity = buildControllerIdentity({
			companyName: "Operador de Rolé (pendiente)",
			ruc: "",
			address: "Quito, Ecuador (pendiente de confirmación)",
			controllerIdentity:
				"el operador de Rolé (identidad legal pendiente de publicación)",
		});
		expect(identity).not.toContain("RUC ");
		expect(identity).toBe(
			"el operador de Rolé (identidad legal pendiente de publicación)",
		);
	});

	test("published ruc composes the full identity", () => {
		const identity = buildControllerIdentity({
			companyName: "Operador Demo S.A.S.",
			ruc: "RUC-DEMO-001",
			address: "Quito, Ecuador",
			controllerIdentity:
				"el operador de Rolé (identidad legal pendiente de publicación)",
		});
		expect(identity).toBe(
			"Operador Demo S.A.S., RUC RUC-DEMO-001, Quito, Ecuador",
		);
	});
});
