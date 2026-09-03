import type { CouponListItemDto } from "@0xc1x/role-commons";
import type { Row } from "@tanstack/react-table";
import { Loader2, MoreHorizontal, Pen, Trash2 } from "lucide-react";
import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CouponUpdateDrawer, useDeleteCoupon } from "@/features/coupons";

export function ActionCell({ row }: { row: Row<CouponListItemDto> }) {
	const [editingCoupon, setEditingCoupon] = useState<CouponListItemDto | null>(
		null,
	);
	const [deletingCoupon, setDeletingCoupon] = useState<CouponListItemDto | null>(
		null,
	);
	const deleteMutation = useDeleteCoupon();

	const handleConfirmDelete = () => {
		if (!deletingCoupon) return;

		deleteMutation.mutate(deletingCoupon.id, {
			onSuccess: () => setDeletingCoupon(null),
		});
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={<Button variant="ghost" className="h-8 w-8 p-0" />}
				>
					<span className="sr-only">Abrir menú</span>
					<MoreHorizontal className="h-4 w-4" />
				</DropdownMenuTrigger>

				<DropdownMenuContent align="end">
					<DropdownMenuGroup>
						<DropdownMenuLabel>Acciones</DropdownMenuLabel>
						<DropdownMenuItem
							onClick={() => navigator.clipboard.writeText(row.original.id)}
						>
							Copiar ID
						</DropdownMenuItem>
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuItem onClick={() => setEditingCoupon(row.original)}>
							<Pen /> Editar Cupón
						</DropdownMenuItem>
						<DropdownMenuItem
							variant="destructive"
							onClick={() => setDeletingCoupon(row.original)}
						>
							<Trash2 /> Eliminar cupón
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			{editingCoupon && (
				<CouponUpdateDrawer
					coupon={editingCoupon}
					isOpen={true}
					onClose={() => setEditingCoupon(null)}
				/>
			)}

			<AlertDialog
				open={!!deletingCoupon}
				onOpenChange={(open) => {
					if (!open) {
						setDeletingCoupon(null);
						deleteMutation.reset();
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>¿Eliminar cupón?</AlertDialogTitle>
						<AlertDialogDescription>
							Esta acción no se puede deshacer. Se eliminará permanentemente el
							cupón{" "}
							<span className="font-medium text-foreground">
								{deletingCoupon?.name}
							</span>
							.
						</AlertDialogDescription>
					</AlertDialogHeader>
					{deleteMutation.error && (
						<p className="text-sm text-destructive">
							{deleteMutation.error.message}
						</p>
					)}
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleteMutation.isPending}>
							Cancelar
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={deleteMutation.isPending}
							onClick={handleConfirmDelete}
						>
							{deleteMutation.isPending ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Eliminando...
								</>
							) : (
								"Eliminar cupón"
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
