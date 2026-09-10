import { ResourceCreateDrawer } from "@/components/resource/resource-drawer";
import { AppConfigForm } from "../forms/app-config.form";
import { appConfigKeys } from "../queries/app-config.keys";

const FORM_ID = "create-app-config-drawer-form";

export function AppConfigCreateDrawer() {
	return (
		<ResourceCreateDrawer
			formId={FORM_ID}
			mutationKey={appConfigKeys.all}
			title="Configuración"
			description="Crear una nueva entrada de configuración"
			triggerLabel="Crear Configuración"
			submitLabel="Crear"
			creatingLabel="Creando"
		>
			{({ formId, onSuccess }) => (
				<AppConfigForm formId={formId} onSuccess={onSuccess} />
			)}
		</ResourceCreateDrawer>
	);
}
