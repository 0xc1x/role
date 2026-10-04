import { ResourceCreateDrawer } from "@/components/resource/resource-drawer";
import { AnnouncementForm } from "../forms/announcement-form";

export function AnnouncementCreateDrawer() {
	return (
		<ResourceCreateDrawer
			formId="create-announcement-drawer-form"
			title="Nuevo aviso"
			description="El aviso aparece en la app de todas las personas de la audiencia elegida."
			triggerLabel="Crear Anuncio"
			submitLabel="Crear Anuncio"
			creatingLabel="Creando aviso"
		>
			{({ formId, onSuccess }) => (
				<AnnouncementForm formId={formId} onSuccess={onSuccess} />
			)}
		</ResourceCreateDrawer>
	);
}
