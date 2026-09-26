import type { BusinessLocationDto } from "@0xc1x/role-commons";
import { ResourceUpdateDrawer } from "@/components/resource/resource-drawer";
import { BusinessLocationForm } from "../forms/business-location.form";

export function BusinessLocationEditDrawer({
	businessId,
	businessName,
	location,
	isOpen,
	onClose,
}: {
	businessId: string;
	businessName: string;
	location: BusinessLocationDto;
	isOpen: boolean;
	onClose: () => void;
}) {
	const formId = `business-location-edit-${location.id}`;
	return (
		<ResourceUpdateDrawer
			formId={formId}
			title="Editar punto de retiro"
			description={`${location.name} — ${businessName}`}
			isOpen={isOpen}
			onClose={onClose}
			submitLabel="Guardar"
			updatingLabel="Guardando"
		>
			<BusinessLocationForm
				formId={formId}
				businessId={businessId}
				businessName={businessName}
				location={location}
				onSuccess={onClose}
			/>
		</ResourceUpdateDrawer>
	);
}
