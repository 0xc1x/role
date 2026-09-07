import type {
	CampaignDto,
	CampaignPaginatedData,
	CreateCampaignDto,
	CreateEmailComponentDto,
	CreateEmailTemplateDto,
	CreateSegmentDto,
	EmailComponentDto,
	EmailComponentPaginatedData,
	EmailTemplateDto,
	EmailTemplatePaginatedData,
	RenderedEmail,
	SegmentDto,
	SegmentPaginatedData,
	UpdateCampaignDto,
	UpdateEmailComponentDto,
	UpdateEmailTemplateDto,
	UpdateSegmentDto,
} from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";
import { toSearchParams } from "@/lib/api/http";

type Q = Record<string, string | number | boolean | null | undefined>;

export const emailApi = {
	// componentes
	listComponents: (q?: Q) =>
		api.get<EmailComponentPaginatedData>(
			`/email-marketing/components${toSearchParams(q)}`,
		),
	createComponent: (b: CreateEmailComponentDto) =>
		api.post<EmailComponentDto>("/email-marketing/components", b),
	updateComponent: (id: string, b: UpdateEmailComponentDto) =>
		api.patch<EmailComponentDto>(`/email-marketing/components/${id}`, b),
	removeComponent: (id: string) =>
		api.delete<never>(`/email-marketing/components/${id}`),

	// plantillas
	listTemplates: (q?: Q) =>
		api.get<EmailTemplatePaginatedData>(
			`/email-marketing/templates${toSearchParams(q)}`,
		),
	createTemplate: (b: CreateEmailTemplateDto) =>
		api.post<EmailTemplateDto>("/email-marketing/templates", b),
	updateTemplate: (id: string, b: UpdateEmailTemplateDto) =>
		api.patch<EmailTemplateDto>(`/email-marketing/templates/${id}`, b),
	removeTemplate: (id: string) =>
		api.delete<never>(`/email-marketing/templates/${id}`),
	renderTemplate: (id: string) =>
		api.post<RenderedEmail>(`/email-marketing/templates/${id}/render`, {}),
	testTemplate: (id: string, emails: string[]) =>
		api.post<{ sent: number }>(`/email-marketing/templates/${id}/test`, {
			emails,
		}),

	// segmentos
	listSegments: (q?: Q) =>
		api.get<SegmentPaginatedData>(
			`/email-marketing/segments${toSearchParams(q)}`,
		),
	createSegment: (b: CreateSegmentDto) =>
		api.post<SegmentDto>("/email-marketing/segments", b),
	getSegmentUsers: (id: string) =>
		api.get<string[]>(`/email-marketing/segments/${id}/users`),
	setSegmentUsers: (id: string, user_ids: string[]) =>
		api.put<never>(`/email-marketing/segments/${id}/users`, { user_ids }),
	updateSegment: (id: string, b: UpdateSegmentDto) =>
		api.patch<SegmentDto>(`/email-marketing/segments/${id}`, b),
	removeSegment: (id: string) =>
		api.delete<never>(`/email-marketing/segments/${id}`),

	// campañas
	listCampaigns: (q?: Q) =>
		api.get<CampaignPaginatedData>(
			`/email-marketing/campaigns${toSearchParams(q)}`,
		),
	createCampaign: (b: CreateCampaignDto) =>
		api.post<CampaignDto>("/email-marketing/campaigns", b),
	updateCampaign: (id: string, b: UpdateCampaignDto) =>
		api.patch<CampaignDto>(`/email-marketing/campaigns/${id}`, b),
	previewCampaign: (id: string) =>
		api.post<RenderedEmail>(`/email-marketing/campaigns/${id}/preview`, {}),
	testCampaign: (id: string, b: { emails: string[] }) =>
		api.post<{ sent: number }>(`/email-marketing/campaigns/${id}/test`, b),
	sendCampaign: (id: string) =>
		api.post<CampaignDto>(`/email-marketing/campaigns/${id}/send`, {}),
	audience: (id: string) =>
		api.post<{ total: number }>(
			`/email-marketing/campaigns/${id}/audience`,
			{},
		),
	cancelCampaign: (id: string) =>
		api.post<CampaignDto>(`/email-marketing/campaigns/${id}/cancel`, {}),
	removeCampaign: (id: string) =>
		api.delete<never>(`/email-marketing/campaigns/${id}`),
};
