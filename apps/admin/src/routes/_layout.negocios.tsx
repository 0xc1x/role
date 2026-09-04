import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useBusinessesList } from "@/features/businesses";
import { columns } from "@/features/businesses/tables/businesses.columns";

const schema = z.object({
	page: z.coerce.number().int().positive().optional().default(1),
	limit: z.coerce.number().int().min(1).max(100).optional().default(20),
	search: z.string().optional(),
	verification_status: z.enum(["pending", "approved", "rejected"]).optional(),
});

export const Route = createFileRoute("/_layout/negocios")({
	validateSearch: (raw) => schema.parse(raw),
	component: RouteComponent,
});

function RouteComponent() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data, isLoading, isError, error } = useBusinessesList(search);
	const [searchInput, setSearchInput] = useState(search.search ?? "");

	useEffect(() => setSearchInput(search.search ?? ""), [search.search]);
	useEffect(() => {
		const t = setTimeout(() => {
			if (searchInput !== (search.search ?? "")) {
				navigate({
					search: { ...search, search: searchInput || undefined, page: 1 },
				});
			}
		}, 300);
		return () => clearTimeout(t);
	}, [searchInput, search.search, search, navigate]);

	if (isLoading) {
		return (
			<div className="px-6 py-4 space-y-4">
				<Skeleton className="h-8 w-48" />
				{[1, 2, 3, 4, 5].map((n) => (
					<Skeleton key={n} className="h-12 w-full" />
				))}
			</div>
		);
	}
	if (isError) {
		return (
			<div className="px-6 py-4">
				<p className="text-destructive">
					{error instanceof Error ? error.message : "Error"}
				</p>
				<Button
					variant="outline"
					onClick={() => navigate({ search: { page: 1, limit: 20 } })}
				>
					Reintentar
				</Button>
			</div>
		);
	}
	const rows = data?.data ?? [];
	const meta = data?.meta;
	return (
		<div className="px-6 py-4">
			<div className="flex items-center justify-between">
				<h1 className="font-bold text-xl">Negocios</h1>
				<div className="flex items-center gap-2">
					<Select
						value={search.verification_status ?? "all"}
						onValueChange={(v) =>
							navigate({
								search: {
									...search,
									verification_status: v === "all" ? undefined : (v as never),
									page: 1,
								},
							})
						}
					>
						<SelectTrigger className="w-40">
							<SelectValue placeholder="Estado" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Todos</SelectItem>
							<SelectItem value="pending">Pendiente</SelectItem>
							<SelectItem value="approved">Aprobado</SelectItem>
							<SelectItem value="rejected">Rechazado</SelectItem>
						</SelectContent>
					</Select>
					<InputGroup className="max-w-sm">
						<InputGroupAddon align="inline-start">
							<Search className="size-4 text-muted-foreground" />
						</InputGroupAddon>
						<InputGroupInput
							placeholder="Buscar negocios..."
							value={searchInput}
							onChange={(e) => setSearchInput(e.target.value)}
						/>
					</InputGroup>
				</div>
			</div>
			<div className="mt-4">
				<DataTable
					columns={columns}
					data={rows}
					meta={meta}
					onPageChange={(page) => navigate({ search: { ...search, page } })}
					onLimitChange={(limit) =>
						navigate({ search: { ...search, page: 1, limit } })
					}
				/>
			</div>
		</div>
	);
}
