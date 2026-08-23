import type { CommissionDto } from "@0xc1x/role-commons";
import { useIsMutating } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
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
	const FORM_ID = "update-commission-drawer-form";
	const isMutating = useIsMutating({ mutationKey: commissionsKeys.all }) > 0;

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => !open && onClose()}
			swipeDirection="right"
		>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>Comisión</DrawerTitle>
					<DrawerDescription>
						Actualiza la comisión de {commission.name}
					</DrawerDescription>
				</DrawerHeader>

				<div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
					<CommissionForm
						formId={FORM_ID}
						commission={commission}
						onSuccess={onClose}
					/>
				</div>

				<DrawerFooter>
					<Button type="submit" form={FORM_ID} disabled={isMutating}>
						{isMutating ? (
							<>
								<Spinner /> Actualizando comisión
							</>
						) : (
							"Actualizar comisión"
						)}
					</Button>
					<DrawerClose>
						<Button variant="outline" className="w-full">
							Cancelar
						</Button>
					</DrawerClose>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
