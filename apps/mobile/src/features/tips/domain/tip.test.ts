import { describe, expect, test } from "bun:test";
import { toTip } from "@/features/tips/domain/tip";

describe("toTip", () => {
	test("mapea fila a tip diario", () => {
		expect(toTip({ id: "t1", content: "Compra local" })).toEqual({
			id: "t1",
			content: "Compra local",
		});
	});
});
