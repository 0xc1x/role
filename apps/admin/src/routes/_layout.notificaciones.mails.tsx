import { ListSendsQuerySchema } from "@0xc1x/role-commons";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PageTabs } from "@/components/page-tabs";
import { ComponentsTab } from "@/features/email/components/components-tab";
import { EnviosTab } from "@/features/email/components/envios-tab";
import { SendTab } from "@/features/email/components/send-tab";
import { TemplatesTab } from "@/features/email/components/templates-tab";

const TABS = ["enviar", "plantillas", "componentes", "envios"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
	enviar: "Enviar",
	plantillas: "Plantillas",
	componentes: "Componentes",
	envios: "Envíos",
};

export const mailsSearchSchema = ListSendsQuerySchema.extend({
	tab: z.enum(TABS).optional(),
	// Paginación opcional en la URL (los tabs aplican sus defaults).
	page: z.coerce.number().int().positive().optional(),
	limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const Route = createFileRoute("/_layout/notificaciones/mails")({
	validateSearch: (raw) => mailsSearchSchema.parse(raw),
	component: MailsPage,
	head: () => ({ meta: [{ title: "Mails | Rolé" }] }),
});

function MailsPage() {
	const { tab: tabFromUrl } = Route.useSearch();
	const navigate = Route.useNavigate();
	const tab = tabFromUrl ?? "enviar";
	const setTab = (t: Tab) =>
		navigate({ search: t === "enviar" ? {} : { tab: t } });
	return (
		<div className="px-6 py-4">
			<h1 className="font-bold text-xl">Mails</h1>
			<div className="mt-4">
				<PageTabs
					tabs={TABS}
					labels={TAB_LABELS}
					value={tab}
					onChange={setTab}
				/>
			</div>
			<div className="mt-6">
				{tab === "enviar" && <SendTab />}
				{tab === "plantillas" && <TemplatesTab />}
				{tab === "componentes" && <ComponentsTab />}
				{tab === "envios" && <EnviosTab />}
			</div>
		</div>
	);
}
