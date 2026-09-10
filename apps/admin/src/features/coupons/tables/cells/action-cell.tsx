import type { CouponListItemDto } from "@0xc1x/role-commons";
import type { Row } from "@tanstack/react-table";
import { ResourceActionCell } from "@/components/data-table/resource-action-cell";
import { CouponUpdateDrawer, useDeleteCoupon } from "@/features/coupons";

export function ActionCell({ row }: { row: Row<CouponListItemDto> }) {
	return (
		<ResourceActionCell
			row={row}
			entityName="cupón"
			displayName={(c) => c.name}
			editLabel="Editar Cupón"
			deleteTitle="¿Eliminar cupón?"
			deleteDescription={(name) => (
				<>
					Esta acción no se puede deshacer. Se eliminará permanentemente el
					cupón <span className="font-medium text-foreground">{name}</span>.
				</>
			)}
			useDelete={useDeleteCoupon}
			renderEditor={(coupon, onClose) =>
				coupon && (
					<CouponUpdateDrawer coupon={coupon} isOpen={true} onClose={onClose} />
				)
			}
		/>
	);
}
