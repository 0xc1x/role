import type { PaginationMeta } from "@0xc1x/role-commons";
import {
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

interface DataTablePaginationProps {
	meta: PaginationMeta | undefined;
	onPageChange?: (page: number) => void;
	onLimitChange?: (limit: number) => void;
}

export function DataTablePagination({
	meta,
	onPageChange,
	onLimitChange,
}: DataTablePaginationProps) {
	const page = meta?.page ?? 1;
	const totalPages = meta?.total_pages ?? 0;
	const total = meta?.total ?? 0;
	const limit = meta?.limit ?? 10;

	return (
		<div className="flex items-center justify-between pt-2">
			<div className="flex items-center gap-2">
				<p className="text-sm font-medium">Mostrar</p>
				<Select
					value={`${limit}`}
					onValueChange={(value) => onLimitChange?.(Number(value))}
				>
					<SelectTrigger className="h-8 w-[70px]">
						<SelectValue placeholder={limit} />
					</SelectTrigger>
					<SelectContent side="top">
						{[10, 20, 50, 100].map((n) => (
							<SelectItem key={n} value={`${n}`}>
								{n}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<span className="text-sm text-muted-foreground">
					{total > 0
						? `${(page - 1) * limit + 1}-${Math.min(page * limit, total)} de ${total} resultados`
						: "0 resultados"}
				</span>
			</div>
			<div className="flex items-center space-x-2">
				<Button
					variant="outline"
					size="icon"
					className="hidden size-8 lg:flex"
					onClick={() => onPageChange?.(1)}
					disabled={page <= 1}
				>
					<span className="sr-only">Ir a la primera página</span>
					<ChevronsLeft />
				</Button>
				<Button
					variant="outline"
					size="icon"
					className="size-8"
					onClick={() => onPageChange?.(page - 1)}
					disabled={page <= 1}
				>
					<span className="sr-only">Ir a la página anterior</span>
					<ChevronLeft />
				</Button>
				<div className="flex w-[100px] items-center justify-center text-sm font-medium">
					Página {page} de {totalPages}
				</div>
				<Button
					variant="outline"
					size="icon"
					className="size-8"
					onClick={() => onPageChange?.(page + 1)}
					disabled={page >= totalPages}
				>
					<span className="sr-only">Ir a la página siguiente</span>
					<ChevronRight />
				</Button>
				<Button
					variant="outline"
					size="icon"
					className="hidden size-8 lg:flex"
					onClick={() => onPageChange?.(totalPages)}
					disabled={page >= totalPages}
				>
					<span className="sr-only">Ir a la última página</span>
					<ChevronsRight />
				</Button>
			</div>
		</div>
	);
}
