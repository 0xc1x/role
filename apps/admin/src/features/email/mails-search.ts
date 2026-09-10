import { ListSendsQuerySchema } from "@0xc1x/role-commons";
import { z } from "zod";

export const MAIL_TABS = [
	"enviar",
	"plantillas",
	"componentes",
	"envios",
] as const;
export type MailTab = (typeof MAIL_TABS)[number];

export const mailsSearchSchema = ListSendsQuerySchema.extend({
	tab: z.enum(MAIL_TABS).optional(),
	// Paginación opcional en la URL (los tabs aplican sus defaults).
	page: z.coerce.number().int().positive().optional(),
	limit: z.coerce.number().int().min(1).max(100).optional(),
});
