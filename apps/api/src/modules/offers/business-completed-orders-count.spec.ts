import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDbContext } from "../../../test/db";
import {
	seedBusiness,
	seedLocation,
	seedOffer,
	seedOrder,
	seedProfile,
} from "../../../test/seed";

let ctx: TestDbContext;
let businessId: string;

beforeAll(async () => {
	ctx = await createTestDb();
	const owner = await seedProfile(ctx.db);
	const business = await seedBusiness(ctx.db, owner);
	businessId = business.id;
	const location = await seedLocation(ctx.db, business.id);
	const offer = await seedOffer(ctx.db, business.id, location.id);
	await seedOrder(ctx.db, await seedProfile(ctx.db), offer.id, business.id, {
		status: "completed",
	});
});

afterAll(async () => {
	await ctx.stop();
});

describe("business_completed_orders_count", () => {
	test("returns the aggregate under a fixed-search_path security definer", async () => {
		const result = (await ctx.db.execute(
			sql`select public.business_completed_orders_count(${businessId}::uuid) as count`,
		)) as unknown as
			| { rows?: Array<{ count: string | number }> }
			| Array<{ count: string | number }>;
		const rows = Array.isArray(result) ? result : result.rows ?? [];
		const count = Number(rows[0]?.count ?? 0);

		expect(count).toBe(1);
		const definition = (await ctx.db.execute(sql`
			select prosecdef, proconfig
			from pg_proc
			where oid = 'public.business_completed_orders_count(uuid)'::regprocedure
		`)) as unknown as
			| { rows?: Array<{ prosecdef: boolean; proconfig: string[] | null }> }
			| Array<{ prosecdef: boolean; proconfig: string[] | null }>;
		const definitionRows = Array.isArray(definition) ? definition : definition.rows ?? [];
		expect(definitionRows[0]?.prosecdef).toBe(true);
		expect(definitionRows[0]?.proconfig).toContain('search_path=""');
	});
});
