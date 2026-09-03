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
import { AppConfigForm } from "../forms/app-config.form";
import { appConfigKeys } from "../queries/app-config.keys";

export function AppConfigCreateDrawer() {
	const [isOpen, setIsOpen] = useState(false);
	const [resetKey, setResetKey] = useState(0);
	const FORM_ID = "create-app-config-drawer-form";
	const isMutating = useIsMutating({ mutationKey: appConfigKeys.all }) > 0;

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
				Crear Configuración
			</DrawerTrigger>

			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>Configuración</DrawerTitle>
					<DrawerDescription>
						Crear una nueva entrada de configuración
					</DrawerDescription>
				</DrawerHeader>

				<div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
					{isOpen && (
						<AppConfigForm
							key={resetKey}
							formId={FORM_ID}
							onSuccess={() => setIsOpen(false)}
						/>
					)}
				</div>

				<DrawerFooter>
					<Button
						type="button"
						onClick={() =>
							(
								document.getElementById(FORM_ID) as HTMLFormElement | null
							)?.requestSubmit()
						}
						disabled={isMutating}
					>
						{isMutating ? (
							<>
								<Spinner /> Creando
							</>
						) : (
							"Crear"
						)}
					</Button>
					<DrawerClose render={<Button variant="outline" className="w-full" />}>
						Cancelar
					</DrawerClose>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
