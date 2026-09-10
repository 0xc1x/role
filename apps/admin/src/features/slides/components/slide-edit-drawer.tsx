import type { SlideDto } from "@0xc1x/role-commons";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { ResourceUpdateDrawer } from "@/components/resource/resource-drawer";
import { Button } from "@/components/ui/button";
import { SlideForm } from "../forms/slide.form";
import { slidesKeys } from "../queries/slides.keys";

interface SlideEditDrawerProps {
	slide: SlideDto;
}

export function SlideEditDrawer({ slide }: SlideEditDrawerProps) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<>
			<Button variant="ghost" size="icon" onClick={() => setIsOpen(true)}>
				<Pencil className="size-4" />
				<span className="sr-only">Editar slide {slide.title}</span>
			</Button>
			{isOpen && (
				<ResourceUpdateDrawer
					formId={`edit-slide-drawer-form-${slide.id}`}
					mutationKey={slidesKeys.all}
					title={slide.title}
					description="Edita el contenido de la slide"
					isOpen
					onClose={() => setIsOpen(false)}
					submitLabel="Guardar cambios"
					updatingLabel="Guardando"
				>
					<SlideForm
						formId={`edit-slide-drawer-form-${slide.id}`}
						slide={slide}
						onSuccess={() => setIsOpen(false)}
					/>
				</ResourceUpdateDrawer>
			)}
		</>
	);
}
