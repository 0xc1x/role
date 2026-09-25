import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

mock.module("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => ({ options }),
}));
mock.module("@/components/navbar", () => ({ Navbar: () => null }));
mock.module("@/components/footer", () => ({ Footer: () => null }));
mock.module("@/components/legal-hero", () => ({ LegalHero: () => null }));
mock.module("@/components/section", () => ({ Eyebrow: () => null }));

import { SECTIONS as PRIVACY_SECTIONS } from "../../routes/privacy";
import { SECTIONS as TERMS_SECTIONS } from "../../routes/terms";

const helpSource = readFileSync(
	new URL("../../routes/help-center.tsx", import.meta.url),
	"utf8",
);

describe("legal copy accuracy", () => {
	test("does not publish fabricated legal identifiers or account actions", () => {
		const privacyCopy = PRIVACY_SECTIONS.map((section) => section.body).join(
			" ",
		);
		const termsCopy = TERMS_SECTIONS.map((section) => section.body).join(" ");

		expect(privacyCopy).not.toContain("1799999999001");
		expect(termsCopy).not.toContain("1799999999001");
		expect(privacyCopy).toContain("{controllerIdentity}");
		expect(termsCopy).toContain("{controllerIdentity}");
		expect(privacyCopy).not.toContain("eliminar o exportar");
		expect(helpSource).not.toContain("eliminar tu cuenta");
	});

	test("describes the actual accept/reject consent behavior", () => {
		const cookieCopy = PRIVACY_SECTIONS.find(
			(section) => section.title === "Cookies",
		)?.body;

		expect(cookieCopy).toContain("aceptar o rechazar");
		expect(cookieCopy).toContain("solo después de aceptar");
	});
});
