import type { ContactMessageListItemDto } from "@0xc1x/role-commons";
import type { Row } from "@tanstack/react-table";
import { Eye, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ActionCell({
	row,
	onOpen,
}: {
	row: Row<ContactMessageListItemDto>;
	onOpen: (fila: ContactMessageListItemDto) => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
				<span className="sr-only">Abrir menú</span>
				<Mail className="h-4 w-4" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuGroup>
					<DropdownMenuLabel>Acciones</DropdownMenuLabel>
					{/* Ver el texto íntegro es la acción principal: sin él el operador
					    solo tiene el extracto de 160 caracteres y no puede saber a qué
					    mensaje está respondiendo. */}
					<DropdownMenuItem onClick={() => onOpen(row.original)}>
						<Eye /> Ver mensaje
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
