import { describe, expect, test } from "bun:test";
import type { CampaignDto } from "@0xc1x/role-commons";
import { emailListOptions, toResendPayload } from "../emails.queries";

describe("emailListOptions", () => {
	test("components: queryKey segmentado por recurso y query", () => {
		const q = { limit: 100, active: true };
		expect([...emailListOptions.components(q).queryKey]).toEqual([
			"email",
			"components",
			q,
		]);
	});

	test("templates: queryKey propio por recurso", () => {
		const q = { limit: 100 };
		expect([...emailListOptions.templates(q).queryKey]).toEqual([
			"email",
			"templates",
			q,
		]);
	});

	test("segments: queryKey propio por recurso", () => {
		expect([...emailListOptions.segments({ limit: 100 }).queryKey]).toEqual([
			"email",
			"segments",
			{ limit: 100 },
		]);
	});

	test("campaigns: queryKey propio por recurso", () => {
		expect([...emailListOptions.campaigns({ page: 1 }).queryKey]).toEqual([
			"email",
			"campaigns",
			{ page: 1 },
		]);
	});

	test("queryFn presente en cada opción", () => {
		for (const opt of [
			emailListOptions.components(),
			emailListOptions.templates(),
			emailListOptions.segments(),
			emailListOptions.campaigns(),
		]) {
			expect(typeof opt.queryFn).toBe("function");
		}
	});
});

describe("toResendPayload", () => {
	const sent: CampaignDto = {
		id: "00000000-0000-0000-0000-000000000001",
		name: "Promo",
		channel: "email",
		template_id: "00000000-0000-0000-0000-000000000002",
		category: "promotions",
		segment_ids: ["00000000-0000-0000-0000-000000000003"],
		include_user_ids: [],
		exclude_user_ids: [],
		scheduled_at: "2026-01-01T00:00:00.000Z",
		status: "sent",
		deleted_at: null,
		sent_at: "2026-01-02T00:00:00.000Z",
		total_recipients: 10,
		total_sent: 10,
		total_failed: 0,
		total_delivered: 9,
		total_opened: 5,
		total_clicked: 1,
		total_bounced: 0,
		created_at: "2026-01-01T00:00:00.000Z",
		updated_at: "2026-01-02T00:00:00.000Z",
	};

	test("copia audiencia y plantilla, nombre sufijado y sin programar", () => {
		expect(toResendPayload(sent)).toEqual({
			name: "Promo (reenvío)",
			channel: "email",
			template_id: "00000000-0000-0000-0000-000000000002",
			category: "promotions",
			segment_ids: ["00000000-0000-0000-0000-000000000003"],
			include_user_ids: [],
			exclude_user_ids: [],
			scheduled_at: null,
		});
	});
});
