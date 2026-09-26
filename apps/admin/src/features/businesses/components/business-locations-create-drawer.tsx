import { ResourceCreateDrawer } from "@/components/resource/resource-drawer";
import { BusinessLocationForm } from "../forms/business-location.form";

export function BusinessLocationCreateDrawer({
	businessId,
	businessName,
}: {
	businessId: string;
	businessName: string;
}) {
	const formId = `business-location-create-${businessId}`;
	return (
		<ResourceCreateDrawer
			formId={formId}
			title="Nuevo punto de retiro"
			description={`Se agrega a ${businessName}`}
			triggerLabel="Nuevo punto de retiro"
			submitLabel="Crear punto de retiro"
			creatingLabel="Creando"
		>
			{({ formId: innerFormId, onSuccess }) => (
				<BusinessLocationForm
					formId={innerFormId}
					businessId={businessId}
					businessName={businessName}
					onSuccess={onSuccess}
				/>
			)}
		</ResourceCreateDrawer>
	);
}
