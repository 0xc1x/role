import { describe, expect, test } from "bun:test";
import { columns as appConfigColumns } from "@/features/app-config/tables/app-config.columns";
import { columns as businessesColumns } from "@/features/businesses/tables/businesses.columns";
import { columns as categoriesColumns } from "@/features/categories/tables/categories.columns";
import { columns as commissionsColumns } from "@/features/commissions/tables/commissions.columns";
import { columns as couponsColumns } from "@/features/coupons/tables/coupons.columns";
import { columns as emailSendsColumns } from "@/features/email-sends/tables/email-sends.columns";
import { columns as slidesColumns } from "@/features/slides/tables/slides.columns";
import { columns as tipsColumns } from "@/features/tips/tables/tips.columns";

function keysOf(cols: Array<{ accessorKey?: string; id?: string }>) {
	return cols.map((c) => c.accessorKey ?? c.id);
}

describe.each([
	["app-config", appConfigColumns, ["key", "label", "active"]],
	["businesses", businessesColumns, ["name", "verification_status"]],
	["categories", categoriesColumns, ["name", "slug", "active"]],
	["commissions", commissionsColumns, ["name", "commission_rate"]],
	["coupons", couponsColumns, ["code", "value", "is_active"]],
	["email-sends", emailSendsColumns, ["email", "status"]],
	["slides", slidesColumns, ["title"]],
	["tips", tipsColumns, ["content", "active"]],
] as Array<
	[string, Array<{ accessorKey?: string; id?: string }>, string[]]
>)("columnas de %s", (_name, cols, expected) => {
	test("expone columnas clave", () => {
		const keys = keysOf(cols);
		for (const k of expected) expect(keys).toContain(k);
	});
});
