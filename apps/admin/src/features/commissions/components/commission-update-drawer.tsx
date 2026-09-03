import type { CommissionDto } from "@0xc1x/role-commons";
import { ResourceUpdateDrawer } from "@/components/resource/resource-drawer";
import { commissionsKeys } from "@/features/commissions";
import { CommissionForm } from "../forms/commission.form";

export interface CommissionUpdateDrawerProps {
	commission: CommissionDto;
	isOpen: boolean;
	onClose: () => void;
}

export function CommissionUpdateDrawer({
	commission,
	isOpen,
	onClose,
}: CommissionUpdateDrawerProps) {
	return (
		<ResourceUpdateDrawer
			formId="update-commission-drawer-form"
			mutationKey={commissionsKeys.all}
			title="Comisión"
			description={`Actualiza la comisión de ${commission.name}`}
			isOpen={isOpen}
			onClose={onClose}
			submitLabel="Actualizar comisión"
			updatingLabel="Actualizando comisión"
		>
			<CommissionForm
				formId="update-commission-drawer-form"
				commission={commission}
				onSuccess={onClose}
			/>
		</ResourceUpdateDrawer>
	);
}
