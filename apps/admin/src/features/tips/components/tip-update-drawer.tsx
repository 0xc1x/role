import type { TipDto } from "@0xc1x/role-commons";
import { ResourceUpdateDrawer } from "@/components/resource/resource-drawer";
import { tipsKeys } from "@/features/tips";
import { TipForm } from "../forms/tip.form";

export interface TipUpdateDrawerProps {
	tip: TipDto;
	isOpen: boolean;
	onClose: () => void;
}

export function TipUpdateDrawer({
	tip,
	isOpen,
	onClose,
}: TipUpdateDrawerProps) {
	return (
		<ResourceUpdateDrawer
			formId="update-tip-drawer-form"
			mutationKey={tipsKeys.all}
			title="Consejo"
			description="Actualiza un consejo existente"
			isOpen={isOpen}
			onClose={onClose}
			submitLabel="Actualizar Consejo"
			updatingLabel="Actualizando consejo"
		>
			<TipForm formId="update-tip-drawer-form" tip={tip} onSuccess={onClose} />
		</ResourceUpdateDrawer>
	);
}
