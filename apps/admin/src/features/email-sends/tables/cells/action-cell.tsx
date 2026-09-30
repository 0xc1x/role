import type { EmailSendDto } from "@0xc1x/role-commons";
import type { Row } from "@tanstack/react-table";
import { MoreHorizontal, Pen, RotateCw } from "lucide-react";
import { useState } from "react";
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
import { EmailSendUpdateDrawer } from "@/features/email-sends/components/email-send-update-drawer";
import { useRetryEmailSend } from "@/features/email-sends/queries/email-sends.queries";

export function ActionCell({ row }: { row: Row<EmailSendDto> }) {
	const [editing, setEditing] = useState<EmailSendDto | null>(null);
	const retryMutation = useRetryEmailSend();

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
						{/* El `onError` vive en la mutación: con uno también en la
						    llamada se dispararían los dos y salían dos toasts del
						    mismo fallo. */}
						<DropdownMenuItem
							onClick={() => retryMutation.mutate(row.original.id)}
						>
							<RotateCw /> Reintentar
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			{editing && (
				<EmailSendUpdateDrawer
					send={editing}
					isOpen={true}
					onClose={() => setEditing(null)}
				/>
			)}
		</>
	);
}
