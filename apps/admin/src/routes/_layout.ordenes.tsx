import {
	ListAdminOrdersQuerySchema,
	ORDER_STATUSES,
	type OrderStatus,
} from "@0xc1x/role-commons";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { z } from "zod";
import { BusinessFilter } from "@/components/business-filter";
import { DataTable } from "@/components/data-table/data-table";
import { ExportCsvButton } from "@/components/data-table/export-csv-button";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useOrdersList } from "@/features/orders";
import { ordersApi } from "@/features/orders/api/orders.api";
import {
	ordersColumns,
	ordersCsvColumns,
} from "@/features/orders/tables/orders.columns";
import { fetchAllPages } from "@/lib/api/fetch-all-pages";
import { formatApiError } from "@/lib/api/notify";
import { orderStatusLabel } from "@/lib/labels";

// Igual que ListAdminOrdersQuerySchema pero con el page size de las tablas (10).
const schema = ListAdminOrdersQuerySchema.extend({
	limit: z.coerce.number().int().min(1).max(100).optional().default(10),
});

export const Route = createFileRoute("/_layout/ordenes")({
	validateSearch: (raw) => schema.parse(raw),
	component: RouteComponent,
});

function RouteComponent() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	// `validateSearch` ya corrió el schema: `stuck` llega como texto en la URL
	// y aquí ya es booleano.
	const { data, isLoading, isError, error, refetch } = useOrdersList(search);

	const patch = (next: Partial<typeof search>) =>
		navigate({ search: { ...search, ...next, page: 1 } });

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
				<p className="text-destructive">{formatApiError(error, "Error")}</p>
				<Button variant="outline" onClick={() => void refetch()}>
					Reintentar
				</Button>
			</div>
		);
	}

	const total = data?.meta.total ?? 0;

	return (
		<div className="px-6 py-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="font-bold text-xl">Órdenes</h1>
				<div className="flex flex-wrap items-center gap-3">
					<ExportCsvButton
						fileName="ordenes"
						columns={ordersCsvColumns}
						total={data?.meta.total ?? 0}
						loadRows={() => fetchAllPages(ordersApi.list, search)}
					/>
					<div className="flex items-center gap-2">
						<Switch
							checked={search.stuck === true}
							onCheckedChange={(checked) => patch({ stuck: checked })}
							aria-label="Solo órdenes atascadas"
						/>
						<span className="text-sm">Solo atascadas</span>
					</div>
					<Select
						value={search.status ?? "all"}
						onValueChange={(v) =>
							patch({
								status: v === "all" ? undefined : (v as OrderStatus),
							})
						}
					>
						<SelectTrigger className="w-48" aria-label="Estado">
							{/* Con children explícitos: sin ellos el trigger muestra el
							    enum crudo (`ready_for_pickup`) en vez de la etiqueta. */}
							<SelectValue>
								{search.status
									? orderStatusLabel(search.status)
									: "Todos los estados"}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Todos los estados</SelectItem>
							{ORDER_STATUSES.map((status) => (
								<SelectItem key={status} value={status}>
									{orderStatusLabel(status)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<BusinessFilter
						value={search.business_id}
						onChange={(business_id) => patch({ business_id })}
						searchLabel="Buscar negocio para filtrar las órdenes"
					/>
				</div>
			</div>

			{search.stuck === true ? (
				<p className="text-muted-foreground mt-2 flex items-center gap-2 text-sm">
					<AlertTriangle className="size-4 text-destructive" />
					Atascada = la ventana de pickup ya cerró y la orden sigue sin
					terminar.
					{total === 1 ? " 1 orden." : ` ${total} órdenes.`}
				</p>
			) : null}

			<div className="mt-4">
				<DataTable
					columns={ordersColumns}
					data={data?.data ?? []}
					meta={data?.meta}
					onPageChange={(page) => navigate({ search: { ...search, page } })}
					onLimitChange={(limit) =>
						navigate({ search: { ...search, page: 1, limit } })
					}
				/>
			</div>
		</div>
	);
}
