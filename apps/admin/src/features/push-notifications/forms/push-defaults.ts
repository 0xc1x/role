import type { PushTemplateDto } from "@0xc1x/role-commons";
import type { PushTemplateFormValues, SendFormValues } from "./push-forms";

export function pushTemplateDefaults(
	t?: PushTemplateDto,
): PushTemplateFormValues {
	return {
		name: t?.name ?? "",
		title: t?.title ?? "",
		body: t?.body ?? "",
		link:
			typeof t?.data === "object" && t.data !== null
				? String((t.data as Record<string, unknown>).link ?? "")
				: "",
		is_active: t?.is_active ?? true,
	};
}

export function sendDefaults(): SendFormValues {
	return {
		template_id: "",
		title: "",
		body: "",
		type: "announcement",
		link: "",
		segment_ids: [],
		include_user_ids: [],
		exclude_user_ids: [],
	};
}
