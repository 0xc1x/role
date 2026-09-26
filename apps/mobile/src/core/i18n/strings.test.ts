import { describe, expect, test } from "bun:test";
import { strings } from "@/src/core/i18n/strings";

// The catalogue substitutes placeholders with `String.replace("{token}", value)`,
// so a dollar-brace placeholder is not a valid entry: the `$` is never consumed
// by the replace and reaches the user as a stray character. Every entry must
// therefore carry bare `{token}` placeholders only.
describe("i18n string placeholders", () => {
	test("no entry uses a dollar-brace template placeholder", () => {
		const offenders: string[] = [];
		const templatePlaceholder = /\$\{[^}]*\}/;

		const walk = (node: unknown, path: string): void => {
			if (typeof node === "string") {
				if (templatePlaceholder.test(node)) offenders.push(`${path}: ${node}`);
				return;
			}
			if (Array.isArray(node)) {
				node.forEach((item, i) => {
					walk(item, `${path}[${i}]`);
				});
				return;
			}
			if (node && typeof node === "object") {
				Object.entries(node).forEach(([key, value]) => {
					walk(value, `${path}.${key}`);
				});
			}
		};

		walk(strings, "strings");
		expect(offenders).toEqual([]);
	});

	test("max-price label renders a single currency symbol", () => {
		// Guards the exact call site in app/all-offers.tsx: the caller supplies
		// the symbol, so the entry must not carry one of its own.
		const maxPrice = 42;
		expect(strings.allOffers.price.replace("{n}", `$${maxPrice}`)).toBe("$42");
	});
});
