import type { TipDto } from "@0xc1x/role-commons";
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
import { TipUpdateDrawer, useDeleteTip } from "@/features/tips";

export function ActionCell({ row }: { row: Row<TipDto> }) {
	const [editingTip, setEditingTip] = useState<TipDto | null>(null);
	const [deletingTip, setDeletingTip] = useState<TipDto | null>(null);
	const deleteMutation = useDeleteTip();

	const handleConfirmDelete = () => {
		if (!deletingTip) return;

		deleteMutation.mutate(deletingTip.id, {
			onSuccess: () => setDeletingTip(null),
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
						<DropdownMenuItem onClick={() => setEditingTip(row.original)}>
							<Pen /> Editar consejo
						</DropdownMenuItem>
						<DropdownMenuItem
							variant="destructive"
							onClick={() => setDeletingTip(row.original)}
						>
							<Trash2 /> Eliminar consejo
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			{editingTip && (
				<TipUpdateDrawer
					tip={editingTip}
					isOpen={true}
					onClose={() => setEditingTip(null)}
				/>
			)}

			<AlertDialog
				open={!!deletingTip}
				onOpenChange={(open) => {
					if (!open) setDeletingTip(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>¿Eliminar consejo?</AlertDialogTitle>
						<AlertDialogDescription>
							Esta acción no se puede deshacer. Se eliminará el consejo{" "}
							<span className="font-medium text-foreground">
								{deletingTip?.content}
							</span>
							.
						</AlertDialogDescription>
					</AlertDialogHeader>
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
								"Eliminar consejo"
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
