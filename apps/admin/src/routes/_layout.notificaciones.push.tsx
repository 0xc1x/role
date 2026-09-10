import { createFileRoute } from "@tanstack/react-router";
import { PageTabs } from "@/components/page-tabs";
import { HistoryTab } from "@/features/push-notifications/components/history-tab";
import { SendTab } from "@/features/push-notifications/components/send-tab";
import { TemplatesTab } from "@/features/push-notifications/components/templates-tab";
import { TokensTab } from "@/features/push-notifications/components/tokens-tab";

const TABS = ["enviar", "plantillas", "historial", "dispositivos"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
	enviar: "Enviar",
	plantillas: "Plantillas",
	historial: "Historial",
	dispositivos: "Dispositivos",
};

export const Route = createFileRoute("/_layout/notificaciones/push")({
	validateSearch: (raw: Record<string, unknown>): { tab?: Tab } => {
		const tab = typeof raw.tab === "string" ? raw.tab : undefined;
		return TABS.includes(tab as Tab) ? { tab: tab as Tab } : {};
	},
	component: PushPage,
	head: () => ({ meta: [{ title: "Notificaciones Push | Rolé" }] }),
});

function PushPage() {
	const { tab: tabFromUrl } = Route.useSearch();
	const navigate = Route.useNavigate();
	const tab = tabFromUrl ?? "enviar";
	const setTab = (t: Tab) =>
		navigate({ search: t === "enviar" ? {} : { tab: t } });

	return (
		<div className="px-6 py-4">
			<h1 className="font-bold text-xl">Notificaciones push</h1>
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
				{tab === "historial" && <HistoryTab />}
				{tab === "dispositivos" && <TokensTab />}
			</div>
		</div>
	);
}
