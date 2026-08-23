import type { TipDto } from "@0xc1x/role-commons";
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
	const FORM_ID = "update-tip-drawer-form";
	const isMutating = useIsMutating({ mutationKey: tipsKeys.all }) > 0;

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => !open && onClose()}
			swipeDirection="right"
		>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>Consejo</DrawerTitle>
					<DrawerDescription>Actualiza un consejo existente</DrawerDescription>
				</DrawerHeader>

				<div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
					<TipForm formId={FORM_ID} tip={tip} onSuccess={onClose} />
				</div>

				<DrawerFooter>
					<Button type="submit" form={FORM_ID} disabled={isMutating}>
						{isMutating ? (
							<>
								<Spinner /> Actualizando consejo
							</>
						) : (
							"Actualizar Consejo"
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
