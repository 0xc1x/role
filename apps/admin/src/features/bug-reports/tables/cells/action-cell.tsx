import type { BugReportListItemDto } from "@0xc1x/role-commons";
import type { Row } from "@tanstack/react-table";
import { Bug, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Una sola acción, y aun así un menú: abrir el reporte es la única cosa que se
 * puede hacer desde la fila, y el drawer es la única superficie con el texto
 * íntegro, las capturas y las acciones de triaje. Un `<Button>` directo sería
 * más corto, pero el panel ya abrió sus filas con este patrón y el operador
 * llega al mismo sitio por el mismo gesto.
 */
export function ActionCell({
	row,
	onOpen,
}: {
	row: Row<BugReportListItemDto>;
	onOpen: (fila: BugReportListItemDto) => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
				<span className="sr-only">Abrir menú</span>
				<Bug className="h-4 w-4" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuGroup>
					<DropdownMenuLabel>Acciones</DropdownMenuLabel>
					<DropdownMenuItem onClick={() => onOpen(row.original)}>
						<Eye /> Ver reporte
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
