import { ResourceCreateDrawer } from "@/components/resource/resource-drawer";
import { CouponForm } from "../forms/coupon.form";

export function CouponCreateDrawer() {
	return (
		<ResourceCreateDrawer
			formId="create-coupon-drawer-form"
			title="Cupón"
			description="Crear un cupón global aplicable a todas las ofertas"
			triggerLabel="Crear Cupón"
			submitLabel="Crear Cupón"
			creatingLabel="Creando cupón"
		>
			{({ formId, onSuccess }) => (
				<CouponForm formId={formId} onSuccess={onSuccess} />
			)}
		</ResourceCreateDrawer>
	);
}
