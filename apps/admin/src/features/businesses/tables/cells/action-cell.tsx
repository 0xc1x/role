import type { BusinessDto } from "@0xc1x/role-commons";
import type { Row } from "@tanstack/react-table";
import { Check, Loader2, MoreHorizontal, Pen, X } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { BusinessUpdateDrawer } from "@/features/businesses/components/business-update-drawer";
import { useVerifyBusiness } from "@/features/businesses/queries/businesses.queries";

export function ActionCell({ row }: { row: Row<BusinessDto> }) {
	const [editing, setEditing] = useState<BusinessDto | null>(null);
	const [rejecting, setRejecting] = useState<BusinessDto | null>(null);
	const [reason, setReason] = useState("");
	const verifyMutation = useVerifyBusiness();

	const handleApprove = () => {
		verifyMutation.mutate({
			id: row.original.id,
			verification_status: "approved",
		});
	};
	const handleReject = () => {
		if (!rejecting) return;
		verifyMutation.mutate(
			{
				id: rejecting.id,
				verification_status: "rejected",
				rejection_reason: reason || "No especificado",
			},
			{ onSuccess: () => setRejecting(null) },
		);
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
						<DropdownMenuItem onClick={() => setEditing(row.original)}>
							<Pen /> Editar
						</DropdownMenuItem>
						{row.original.verification_status !== "approved" && (
							<DropdownMenuItem onClick={handleApprove}>
								<Check /> Aprobar
							</DropdownMenuItem>
						)}
						{row.original.verification_status !== "rejected" && (
							<DropdownMenuItem
								variant="destructive"
								onClick={() => setRejecting(row.original)}
							>
								<X /> Rechazar
							</DropdownMenuItem>
						)}
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			{editing && (
				<BusinessUpdateDrawer
					business={editing}
					isOpen={true}
					onClose={() => setEditing(null)}
				/>
			)}

			<AlertDialog
				open={!!rejecting}
				onOpenChange={(open) => !open && setRejecting(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>¿Rechazar negocio?</AlertDialogTitle>
						<AlertDialogDescription>
							<span className="font-medium text-foreground">
								{rejecting?.name}
							</span>{" "}
							quedará en estado rechazado y no será visible. Indica el motivo.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<Textarea
						placeholder="Motivo del rechazo"
						value={reason}
						onChange={(e) => setReason(e.target.value)}
					/>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={verifyMutation.isPending}>
							Cancelar
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={verifyMutation.isPending}
							onClick={handleReject}
						>
							{verifyMutation.isPending ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Rechazando...
								</>
							) : (
								"Rechazar"
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
