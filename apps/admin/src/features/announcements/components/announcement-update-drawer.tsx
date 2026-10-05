import type { AnnouncementDto } from "@0xc1x/role-commons";
import { ResourceUpdateDrawer } from "@/components/resource/resource-drawer";
import { AnnouncementForm } from "../forms/announcement-form";

export interface AnnouncementUpdateDrawerProps {
	announcement: AnnouncementDto;
	isOpen: boolean;
	onClose: () => void;
}

export function AnnouncementUpdateDrawer({
	announcement,
	isOpen,
	onClose,
}: AnnouncementUpdateDrawerProps) {
	return (
		<ResourceUpdateDrawer
			formId="update-announcement-drawer-form"
			title="Anuncio"
			description="Actualiza un anuncio existente"
			isOpen={isOpen}
			onClose={onClose}
			submitLabel="Actualizar Anuncio"
			updatingLabel="Actualizando anuncio"
		>
			<AnnouncementForm
				formId="update-announcement-drawer-form"
				announcement={announcement}
				onSuccess={onClose}
			/>
		</ResourceUpdateDrawer>
	);
}
