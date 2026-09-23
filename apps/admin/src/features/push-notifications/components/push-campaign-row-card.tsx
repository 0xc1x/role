import type { CampaignDto } from "@0xc1x/role-commons";
import { MoreHorizontal, Pencil, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import { ConfirmDeleteDialog } from "@/features/email/components/confirm-delete-dialog";

export function PushCampaignRowCard(props: {
	campaign: CampaignDto;
	onEdit: () => void;
	onSend: () => void;
	onResend: () => void;
	onCancel: () => void;
	onTest: () => void;
	onRemove: () => Promise<unknown>;
	busy: boolean;
}) {
	const c = props.campaign;
	const [confirmDelete, setConfirmDelete] = useState(false);
	const statusVariant =
		c.status === "sent"
			? "default"
			: c.status === "failed" || c.status === "cancelled"
				? "destructive"
				: "secondary";

	return (
		<>
			<div className="flex items-center justify-between rounded-lg border p-3">
				<div>
					<p className="font-medium">{c.name}</p>
					<p className="text-sm text-muted-foreground">
						{c.category} · {c.total_recipients} destinatarios · {c.total_sent}{" "}
						enviados · {c.total_failed} fallidos
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Badge variant={statusVariant}>{c.status}</Badge>
					<Button
						size="sm"
						variant="outline"
						onClick={props.onTest}
						disabled={props.busy || !c.template_id}
					>
						Probar
					</Button>
					{c.status === "draft" ||
					c.status === "scheduled" ||
					c.status === "failed" ? (
						<Button size="sm" onClick={props.onSend} disabled={props.busy}>
							<Send className="size-4" /> Enviar
						</Button>
					) : null}
					{c.status === "sent" || c.status === "cancelled" ? (
						<Button
							size="sm"
							variant="outline"
							onClick={props.onResend}
							disabled={props.busy}
						>
							Reenviar
						</Button>
					) : null}
					{c.status === "sending" || c.status === "scheduled" ? (
						<Button
							size="sm"
							variant="outline"
							onClick={props.onCancel}
							disabled={props.busy}
						>
							Cancelar envío
						</Button>
					) : null}
					<DropdownMenu>
						<DropdownMenuTrigger
							render={<Button variant="ghost" size="icon-sm" />}
						>
							<span className="sr-only">Abrir menú</span>
							<MoreHorizontal className="size-4" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuGroup>
								<DropdownMenuLabel>Acciones</DropdownMenuLabel>
								<DropdownMenuItem onClick={props.onEdit}>
									<Pencil className="size-4" /> Editar
								</DropdownMenuItem>
								{c.status !== "sending" ? (
									<>
										<DropdownMenuSeparator />
										<DropdownMenuItem
											variant="destructive"
											onClick={() => setConfirmDelete(true)}
										>
											<Trash2 className="size-4" /> Eliminar
										</DropdownMenuItem>
									</>
								) : null}
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			<ConfirmDeleteDialog
				open={confirmDelete}
				onOpenChange={setConfirmDelete}
				title={`Eliminar la campaña "${c.name}"?`}
				onRemove={props.onRemove}
				busy={props.busy}
			/>
		</>
	);
}
