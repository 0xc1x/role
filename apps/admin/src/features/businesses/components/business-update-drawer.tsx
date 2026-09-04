import type { BusinessDto } from "@0xc1x/role-commons";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { BusinessForm } from "../forms/business.form";

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
		<Drawer open={isOpen} onOpenChange={(o) => !o && onClose()}>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>Editar negocio</DrawerTitle>
					<DrawerDescription>{business.name}</DrawerDescription>
				</DrawerHeader>
				<div className="px-4">
					<BusinessForm
						formId={formId}
						business={business}
						onSuccess={onClose}
					/>
				</div>
				<DrawerFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button type="submit" form={formId}>
						Guardar
					</Button>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
