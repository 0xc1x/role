import type { SlideDto } from "@0xc1x/role-commons";
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
import { SlideForm } from "../forms/slide.form";
import { slidesKeys } from "../queries/slides.keys";

interface SlideEditDrawerProps {
	slide: SlideDto;
}

export function SlideEditDrawer({ slide }: SlideEditDrawerProps) {
	const [isOpen, setIsOpen] = useState(false);
	const FORM_ID = `edit-slide-drawer-form-${slide.id}`;
	const isMutating = useIsMutating({ mutationKey: slidesKeys.all }) > 0;

	return (
		<Drawer open={isOpen} onOpenChange={setIsOpen} swipeDirection="right">
			<DrawerTrigger render={<Button variant="ghost" size="icon" />}>
				<Pencil className="size-4" />
				<span className="sr-only">Editar slide {slide.title}</span>
			</DrawerTrigger>

			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>{slide.title}</DrawerTitle>
					<DrawerDescription>Edita el contenido de la slide</DrawerDescription>
				</DrawerHeader>

				<div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
					{isOpen && (
						<SlideForm
							formId={FORM_ID}
							slide={slide}
							onSuccess={() => setIsOpen(false)}
						/>
					)}
				</div>

				<DrawerFooter>
					<Button type="submit" form={FORM_ID} disabled={isMutating}>
						{isMutating ? (
							<>
								<Spinner /> Guardando
							</>
						) : (
							"Guardar cambios"
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
