import type {
	EmailComponentDto,
	EmailTemplateDto,
	SegmentDto,
} from "@0xc1x/role-commons";
import type {
	ComponentFormValues,
	SegmentFormValues,
	TemplateFormValues,
} from "./email-forms";

export function templateDefaults(t?: EmailTemplateDto): TemplateFormValues {
	return {
		name: t?.name ?? "",
		subject: t?.subject ?? "",
		body_html: t?.body_html ?? "",
		header_id: t?.header_id ?? null,
		footer_id: t?.footer_id ?? null,
		variables: t?.variables ?? [],
		is_active: t?.is_active ?? true,
	};
}

export function segmentDefaults(s?: SegmentDto): SegmentFormValues {
	return {
		name: s?.name ?? "",
		description: s?.description ?? "",
		type: s?.type ?? "dynamic",
		filtersJson: s?.filters ? JSON.stringify(s.filters, null, 2) : "",
		category: s?.category ?? "announcements",
		user_ids: [],
		is_active: s?.is_active ?? true,
	};
}

export function componentDefaults(c?: EmailComponentDto): ComponentFormValues {
	return {
		name: c?.name ?? "",
		type: c?.type ?? "header",
		html_content: c?.html_content ?? "",
		is_active: c?.is_active ?? true,
	};
}
