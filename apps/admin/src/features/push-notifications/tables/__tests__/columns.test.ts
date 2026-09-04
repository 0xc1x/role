import { describe, expect, test } from "bun:test";
import { historyColumns } from "../history-columns";
import { tokenColumns } from "../tokens-columns";

function keysOf(cols: Array<{ accessorKey?: string; id?: string }>) {
	return cols.map((c) => c.accessorKey ?? c.id);
}

describe("tokenColumns", () => {
	test("expone las columnas esperadas", () => {
		const keys = keysOf(tokenColumns);
		for (const k of ["user_email", "platform", "token"]) {
			expect(keys).toContain(k);
		}
	});
});

describe("historyColumns", () => {
	test("expone las columnas esperadas", () => {
		const keys = keysOf(historyColumns);
		for (const k of ["created_at", "title", "type"]) {
			expect(keys).toContain(k);
		}
	});
});
