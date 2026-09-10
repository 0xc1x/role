import { createFileRoute } from "@tanstack/react-router";
import { PageTabs } from "@/components/page-tabs";
import { ComponentsTab } from "@/features/email/components/components-tab";
import { EnviosTab } from "@/features/email/components/envios-tab";
import { SendTab } from "@/features/email/components/send-tab";
import { TemplatesTab } from "@/features/email/components/templates-tab";
import {
	MAIL_TABS,
	type MailTab,
	mailsSearchSchema,
} from "@/features/email/mails-search";

const TABS = MAIL_TABS;
type Tab = MailTab;

const TAB_LABELS: Record<Tab, string> = {
	enviar: "Enviar",
	plantillas: "Plantillas",
	componentes: "Componentes",
	envios: "Envíos",
};

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
