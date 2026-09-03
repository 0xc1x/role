import type {
	PushNotificationPaginatedData,
	PushNotificationDto,
	PushSendResult,
	PushTemplateDto,
	PushTemplatePaginatedData,
	PushTestDto,
	PushTokenPaginatedData,
} from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";
import { toSearchParams } from "@/lib/api/http";

type Q = Record<string, string | number | boolean | null | undefined>;

export interface PushSendBody {
	title: string;
	body: string;
	type: string;
	data?: Record<string, unknown>;
	segment_ids: string[];
	include_user_ids: string[];
	exclude_user_ids: string[];
}

export interface PushAudienceBody {
	segment_ids: string[];
	include_user_ids: string[];
	exclude_user_ids: string[];
}

export const pushApi = {
	// historial
	listHistory: (q?: Q) =>
		api.get<PushNotificationPaginatedData>(
			`/push-notifications${toSearchParams(q)}`,
		),
	getHistory: (id: string) =>
		api.get<PushNotificationDto>(`/push-notifications/${id}`),

	// plantillas
	listTemplates: (q?: Q) =>
		api.get<PushTemplatePaginatedData>(
			`/push-notifications/templates${toSearchParams(q)}`,
		),
	createTemplate: (b: unknown) =>
		api.post<PushTemplateDto>("/push-notifications/templates", b),
	updateTemplate: (id: string, b: unknown) =>
		api.patch<PushTemplateDto>(`/push-notifications/templates/${id}`, b),
	removeTemplate: (id: string) =>
		api.delete<never>(`/push-notifications/templates/${id}`),
	testTemplate: (id: string, b: PushTestDto) =>
		api.post<PushSendResult>(`/push-notifications/templates/${id}/test`, b),

	// envío
	audience: (b: PushAudienceBody) =>
		api.post<{ total: number }>("/push-notifications/audience", b),
	send: (b: PushSendBody) =>
		api.post<PushSendResult>("/push-notifications/send", b),
	test: (b: PushTestDto) =>
		api.post<PushSendResult>("/push-notifications/test", b),

	// dispositivos
	listTokens: (q?: Q) =>
		api.get<PushTokenPaginatedData>(
			`/push-notifications/tokens${toSearchParams(q)}`,
		),
	updateToken: (id: string, b: { is_active: boolean }) =>
		api.patch<never>(`/push-notifications/tokens/${id}`, b),
};
