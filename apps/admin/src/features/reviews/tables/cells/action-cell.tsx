import type { ReviewModerationItemDto } from "@0xc1x/role-commons";
import type { Row } from "@tanstack/react-table";
import { Eye, EyeOff, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ReviewActionCell({
	row,
	onHide,
	onUnhide,
}: {
	row: Row<ReviewModerationItemDto>;
	onHide: (fila: ReviewModerationItemDto) => void;
	onUnhide: (fila: ReviewModerationItemDto) => void;
}) {
	const { is_hidden } = row.original;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
				<span className="sr-only">Abrir menú</span>
				<MoreHorizontal className="h-4 w-4" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuGroup>
					<DropdownMenuLabel>Moderación</DropdownMenuLabel>
					{is_hidden ? (
						<DropdownMenuItem onClick={() => onUnhide(row.original)}>
							<Eye /> Volver a mostrar
						</DropdownMenuItem>
					) : (
						<DropdownMenuItem onClick={() => onHide(row.original)}>
							<EyeOff /> Ocultar reseña
						</DropdownMenuItem>
					)}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
