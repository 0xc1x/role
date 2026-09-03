import type { AppConfigDto } from "@0xc1x/role-commons";
import { useIsMutating } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
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

interface AppConfigEditDrawerProps {
	config: AppConfigDto;
}

export function AppConfigEditDrawer({ config }: AppConfigEditDrawerProps) {
	const [isOpen, setIsOpen] = useState(false);
	const FORM_ID = `edit-app-config-drawer-form-${config.key}`;
	const isMutating = useIsMutating({ mutationKey: appConfigKeys.all }) > 0;

	return (
		<Drawer open={isOpen} onOpenChange={setIsOpen} swipeDirection="right">
			<DrawerTrigger render={<Button variant="ghost" size="icon" />}>
				<Pencil className="size-4" />
				<span className="sr-only">Editar {config.label}</span>
			</DrawerTrigger>

			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle className="font-mono text-base">
						{config.key}
					</DrawerTitle>
					<DrawerDescription>{config.label}</DrawerDescription>
				</DrawerHeader>

				<div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
					{isOpen && (
						<AppConfigForm
							formId={FORM_ID}
							config={config}
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
								<Spinner /> Guardando
							</>
						) : (
							"Guardar cambios"
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
