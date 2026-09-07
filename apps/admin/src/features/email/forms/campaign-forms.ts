import type { CampaignDto, MarketingCategory } from "@0xc1x/role-commons";

/** Valores del formulario crear/editar campaña (representación UI). */
export interface CampaignFormValues {
	name: string;
	template_id: string;
	category: MarketingCategory;
	segment_ids: string[];
	include_user_ids: string[];
	exclude_user_ids: string[];
	scheduled_at: string;
}

export function campaignDefaults(c?: CampaignDto): CampaignFormValues {
	return {
		name: c?.name ?? "",
		template_id: c?.template_id ?? "",
		category: c?.category ?? "announcements",
		segment_ids: c?.segment_ids ?? [],
		include_user_ids: c?.include_user_ids ?? [],
		exclude_user_ids: c?.exclude_user_ids ?? [],
		scheduled_at: c?.scheduled_at?.slice(0, 16) ?? "",
	};
}
