import type { CategoryDto } from "@0xc1x/role-commons";
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
import { CategoryUpdateDrawer, useDeleteCategory } from "@/features/categories";

export function ActionCell({ row }: { row: Row<CategoryDto> }) {
	const [editingCategory, setEditingCategory] = useState<CategoryDto | null>(
		null,
	);
	const [deletingCategory, setDeletingCategory] = useState<CategoryDto | null>(
		null,
	);
	const deleteMutation = useDeleteCategory();

	const handleConfirmDelete = () => {
		if (!deletingCategory) return;

		deleteMutation.mutate(deletingCategory.id, {
			onSuccess: () => setDeletingCategory(null),
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
						<DropdownMenuItem onClick={() => setEditingCategory(row.original)}>
							<Pen /> Editar Categoría
						</DropdownMenuItem>
						<DropdownMenuItem
							variant="destructive"
							onClick={() => setDeletingCategory(row.original)}
						>
							<Trash2 /> Eliminar categoría
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			{editingCategory && (
				<CategoryUpdateDrawer
					category={editingCategory}
					isOpen={true}
					onClose={() => setEditingCategory(null)}
				/>
			)}

			<AlertDialog
				open={!!deletingCategory}
				onOpenChange={(open) => {
					if (!open) {
						setDeletingCategory(null);
						deleteMutation.reset();
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>¿Eliminar categoría?</AlertDialogTitle>
						<AlertDialogDescription>
							Esta acción no se puede deshacer. Se eliminará permanentemente la
							categoría{" "}
							<span className="font-medium text-foreground">
								{deletingCategory?.name}
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
								"Eliminar categoría"
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
