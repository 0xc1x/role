import type {
	CreatePushSendDto,
	CreatePushTemplateDto,
	ListPushNotificationsQuery,
	ListPushTemplatesQuery,
	ListPushTokensQuery,
	PushAudienceDto,
	PushNotificationDto,
	PushNotificationPaginatedData,
	PushSendResult,
	PushTemplateDto,
	PushTemplatePaginatedData,
	PushTestDto,
	PushTokenPaginatedData,
	UpdatePushTemplateDto,
	UpdatePushTokenDto,
} from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";
import { toSearchParams } from "@/lib/api/http";

export const pushApi = {
	// historial
	listHistory: (q?: ListPushNotificationsQuery) =>
		api.get<PushNotificationPaginatedData>(
			`/push-notifications${toSearchParams(q)}`,
		),
	getHistory: (id: string) =>
		api.get<PushNotificationDto>(`/push-notifications/${id}`),

	// plantillas
	listTemplates: (q?: ListPushTemplatesQuery) =>
		api.get<PushTemplatePaginatedData>(
			`/push-notifications/templates${toSearchParams(q)}`,
		),
	createTemplate: (b: CreatePushTemplateDto) =>
		api.post<PushTemplateDto>("/push-notifications/templates", b),
	updateTemplate: (id: string, b: UpdatePushTemplateDto) =>
		api.patch<PushTemplateDto>(`/push-notifications/templates/${id}`, b),
	removeTemplate: (id: string) =>
		api.delete<never>(`/push-notifications/templates/${id}`),
	testTemplate: (id: string, b: PushTestDto) =>
		api.post<PushSendResult>(`/push-notifications/templates/${id}/test`, b),

	// envío
	audience: (b: PushAudienceDto) =>
		api.post<{ total: number }>("/push-notifications/audience", b),
	send: (b: CreatePushSendDto) =>
		api.post<PushSendResult>("/push-notifications/send", b),
	test: (b: PushTestDto) =>
		api.post<PushSendResult>("/push-notifications/test", b),

	// dispositivos
	listTokens: (q?: ListPushTokensQuery) =>
		api.get<PushTokenPaginatedData>(
			`/push-notifications/tokens${toSearchParams(q)}`,
		),
	updateToken: (id: string, b: UpdatePushTokenDto) =>
		api.patch<never>(`/push-notifications/tokens/${id}`, b),
};
