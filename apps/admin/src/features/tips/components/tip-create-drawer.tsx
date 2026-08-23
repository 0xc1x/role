import { useIsMutating } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { tipsKeys } from "@/features/tips";
import { TipForm } from "../forms/tip.form";

export function TipCreateDrawer() {
	const [isOpen, setIsOpen] = useState(false);
	const [resetKey, setResetKey] = useState(0);
	const FORM_ID = "create-tip-drawer-form";
	const isMutating = useIsMutating({ mutationKey: tipsKeys.all }) > 0;

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => {
				setIsOpen(open);
				if (!open) setResetKey((k) => k + 1);
			}}
			swipeDirection="right"
		>
			<DrawerTrigger render={<Button variant="ghost" className="shadow-sm" />}>
				<Plus />
				Crear Consejo
			</DrawerTrigger>

			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>Consejo</DrawerTitle>
					<DrawerDescription>Crear un nuevo consejo</DrawerDescription>
				</DrawerHeader>

				<div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
					{isOpen && (
						<TipForm
							key={resetKey}
							formId={FORM_ID}
							onSuccess={() => setIsOpen(false)}
						/>
					)}
				</div>

				<DrawerFooter>
					<Button type="submit" form={FORM_ID} disabled={isMutating}>
						{isMutating ? (
							<>
								<Spinner /> Creando consejo
							</>
						) : (
							"Crear Consejo"
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
