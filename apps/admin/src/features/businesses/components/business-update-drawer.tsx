import type { BusinessDto } from "@0xc1x/role-commons";
import { ResourceUpdateDrawer } from "@/components/resource/resource-drawer";
import { BusinessForm } from "../forms/business.form";
import { businessesKeys } from "../queries/businesses.keys";

export function BusinessUpdateDrawer({
	business,
	isOpen,
	onClose,
}: {
	business: BusinessDto;
	isOpen: boolean;
	onClose: () => void;
}) {
	const formId = `business-update-${business.id}`;
	return (
		<ResourceUpdateDrawer
			formId={formId}
			mutationKey={businessesKeys.all}
			title="Editar negocio"
			description={business.name}
			isOpen={isOpen}
			onClose={onClose}
			submitLabel="Guardar"
			updatingLabel="Guardando"
		>
			<BusinessForm formId={formId} business={business} onSuccess={onClose} />
		</ResourceUpdateDrawer>
	);
}
