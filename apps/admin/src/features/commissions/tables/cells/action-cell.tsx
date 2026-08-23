import type { CommissionDto } from "@0xc1x/role-commons";
import type { Row } from "@tanstack/react-table";
import { Ban, MoreHorizontal, Pen } from "lucide-react";
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
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { CommissionUpdateDrawer } from "../../components/commission-update-drawer";

export function ActionCell({ row }: { row: Row<CommissionDto> }) {
	const [editing, setEditing] = useState<CommissionDto | null>(null);
	const blocked = row.original.has_pending_payouts;

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
						<Tooltip>
							<TooltipTrigger
								render={
									<DropdownMenuItem
										disabled={blocked}
										onClick={() => setEditing(row.original)}
									/>
								}
							>
								<Pen /> Editar Comisión
							</TooltipTrigger>
							{blocked && (
								<TooltipContent>
									Tiene pagos pendientes de procesar
								</TooltipContent>
							)}
						</Tooltip>
						{blocked && (
							<DropdownMenuItem disabled variant="destructive">
								<Ban /> Pagos pendientes
							</DropdownMenuItem>
						)}
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() => navigator.clipboard.writeText(row.original.id)}
					>
						Copiar ID
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			{editing && (
				<CommissionUpdateDrawer
					commission={editing}
					isOpen={true}
					onClose={() => setEditing(null)}
				/>
			)}
		</>
	);
}
