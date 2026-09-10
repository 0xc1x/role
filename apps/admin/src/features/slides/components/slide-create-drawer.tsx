import { ResourceCreateDrawer } from "@/components/resource/resource-drawer";
import { SlideForm } from "../forms/slide.form";
import { slidesKeys } from "../queries/slides.keys";

const FORM_ID = "create-slide-drawer-form";

export function SlideCreateDrawer() {
	return (
		<ResourceCreateDrawer
			formId={FORM_ID}
			mutationKey={slidesKeys.all}
			title="Slide"
			description="Crear una nueva slide"
			triggerLabel="Crear Slide"
			submitLabel="Crear Slide"
			creatingLabel="Creando Slide"
		>
			{({ formId, onSuccess }) => (
				<SlideForm formId={formId} onSuccess={onSuccess} />
			)}
		</ResourceCreateDrawer>
	);
}
