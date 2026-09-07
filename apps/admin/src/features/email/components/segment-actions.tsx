import type { SegmentDto } from "@0xc1x/role-commons";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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

/** Menú de acciones + confirmación (mismo patrón que categorías). */
export function SegmentActions(props: {
	segment: SegmentDto;
	onRemove: () => Promise<unknown>;
	isRemoving: boolean;
}) {
	const [confirmOpen, setConfirmOpen] = useState(false);
	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
					<span className="sr-only">Abrir menú</span>
					<MoreHorizontal className="size-4" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuGroup>
						<DropdownMenuLabel>Acciones</DropdownMenuLabel>
						<DropdownMenuItem
							onClick={() => navigator.clipboard.writeText(props.segment.id)}
						>
							Copiar ID
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							variant="destructive"
							onClick={() => setConfirmOpen(true)}
						>
							<Trash2 className="size-4" /> Eliminar
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Eliminar el segmento "{props.segment.name}"?
						</AlertDialogTitle>
						<AlertDialogDescription>
							El segmento se desactiva y deja de aparecer en la lista. Esta
							acción no se puede deshacer.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							onClick={async () => {
								try {
									await props.onRemove();
									setConfirmOpen(false);
								} catch (err) {
									toast.error(
										err instanceof Error ? err.message : "Error inesperado",
									);
								}
							}}
						>
							{props.isRemoving ? <Spinner /> : null} Eliminar
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
