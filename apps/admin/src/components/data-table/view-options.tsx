import type { Table } from "@tanstack/react-table";
import { Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function DataTableViewOptions<TData>({
	table,
}: {
	table: Table<TData>;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="outline"
						size="sm"
						className="ml-auto hidden h-8 lg:flex"
					/>
				}
			>
				<Settings2 />
				Visualizar columnas
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-38">
				<DropdownMenuGroup>
					<DropdownMenuLabel>Alternar columnas</DropdownMenuLabel>
					<DropdownMenuSeparator />
					{table.getAllColumns().flatMap((column) => {
						if (
							typeof column.accessorFn === "undefined" ||
							!column.getCanHide()
						) {
							return [];
						}
						return (
							<DropdownMenuCheckboxItem
								key={column.id}
								className="capitalize"
								checked={column.getIsVisible()}
								onCheckedChange={(value) => column.toggleVisibility(!!value)}
							>
								{column.id}
							</DropdownMenuCheckboxItem>
						);
					})}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
