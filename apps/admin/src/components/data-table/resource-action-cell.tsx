import type { Row } from "@tanstack/react-table";
import { MoreHorizontal, Pen, Trash2 } from "lucide-react";
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
import { Spinner } from "@/components/ui/spinner";

interface DeleteMutation {
	mutate: (id: string, opts?: { onSuccess?: () => void }) => void;
	reset: () => void;
	isPending: boolean;
	error: Error | null;
}

/** Celda de acciones genérica: menú copiar/editar/eliminar + diálogo de borrado. */
export function ResourceActionCell<TRow extends { id: string }>(props: {
	row: Row<TRow>;
	entityName: string;
	displayName: (row: TRow) => string;
	editLabel: string;
	deleteTitle: string;
	deleteDescription: (name: string) => React.ReactNode;
	useDelete: () => DeleteMutation;
	renderEditor: (row: TRow | null, onClose: () => void) => React.ReactNode;
}) {
	const [editing, setEditing] = useState<TRow | null>(null);
	const [deleting, setDeleting] = useState<TRow | null>(null);
	const deleteMutation = props.useDelete();

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
					<span className="sr-only">Abrir menú</span>
					<MoreHorizontal className="h-4 w-4" />
				</DropdownMenuTrigger>

				<DropdownMenuContent align="end">
					<DropdownMenuGroup>
						<DropdownMenuLabel>Acciones</DropdownMenuLabel>
						<DropdownMenuItem
							onClick={() =>
								navigator.clipboard.writeText(props.row.original.id)
							}
						>
							Copiar ID
						</DropdownMenuItem>
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuItem onClick={() => setEditing(props.row.original)}>
							<Pen /> {props.editLabel}
						</DropdownMenuItem>
						<DropdownMenuItem
							variant="destructive"
							onClick={() => setDeleting(props.row.original)}
						>
							<Trash2 /> Eliminar {props.entityName}
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			{editing && props.renderEditor(editing, () => setEditing(null))}

			<AlertDialog
				open={!!deleting}
				onOpenChange={(open) => {
					if (!open) {
						setDeleting(null);
						deleteMutation.reset();
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{props.deleteTitle}</AlertDialogTitle>
						<AlertDialogDescription>
							{deleting && props.deleteDescription(props.displayName(deleting))}
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
							onClick={() =>
								deleting &&
								deleteMutation.mutate(deleting.id, {
									onSuccess: () => setDeleting(null),
								})
							}
						>
							{deleteMutation.isPending ? (
								<>
									<Spinner />
									Eliminando...
								</>
							) : (
								`Eliminar ${props.entityName}`
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
