import { ResourceCreateDrawer } from "@/components/resource/resource-drawer";
import { TipForm } from "../forms/tip.form";

export function TipCreateDrawer() {
	return (
		<ResourceCreateDrawer
			formId="create-tip-drawer-form"
			title="Consejo"
			description="Crear un nuevo consejo"
			triggerLabel="Crear Consejo"
			submitLabel="Crear Consejo"
			creatingLabel="Creando consejo"
		>
			{({ formId, onSuccess }) => (
				<TipForm formId={formId} onSuccess={onSuccess} />
			)}
		</ResourceCreateDrawer>
	);
}
