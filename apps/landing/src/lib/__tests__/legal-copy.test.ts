import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// The legal copy is plain data in lib/legal, so this spec needs no router,
// component or module mocks. It used to import it from the route files, which
// meant mocking createFileRoute, the navbar, the footer and the hero just to
// read a string array.
import { PRIVACY_SECTIONS } from "../legal/privacy-content";
import { TERMS_SECTIONS } from "../legal/terms-content";

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
