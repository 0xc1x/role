import type { CouponDto } from "@0xc1x/role-commons";
import { ResourceUpdateDrawer } from "@/components/resource/resource-drawer";
import { couponsKeys } from "@/features/coupons";
import { CouponForm } from "../forms/coupon.form";

export interface CouponUpdateDrawerProps {
	coupon: CouponDto;
	isOpen: boolean;
	onClose: () => void;
}

export function CouponUpdateDrawer({
	coupon,
	isOpen,
	onClose,
}: CouponUpdateDrawerProps) {
	return (
		<ResourceUpdateDrawer
			formId="update-coupon-drawer-form"
			mutationKey={couponsKeys.all}
			title="Cupón"
			description="Actualiza un cupón existente"
			isOpen={isOpen}
			onClose={onClose}
			submitLabel="Actualizar Cupón"
			updatingLabel="Actualizando cupón"
		>
			<CouponForm
				formId="update-coupon-drawer-form"
				coupon={coupon}
				onSuccess={onClose}
			/>
		</ResourceUpdateDrawer>
	);
}
