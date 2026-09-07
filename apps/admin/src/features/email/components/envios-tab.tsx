import type { EmailSendStatus, EmailSendType } from "@0xc1x/role-commons";
import { getRouteApi } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
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
import { useEmailSendsList } from "@/features/email-sends/queries/email-sends.queries";
import { columns as sendsColumns } from "@/features/email-sends/tables/email-sends.columns";

const Route = getRouteApi("/_layout/notificaciones/mails");

export function EnviosTab() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data, isLoading, isError, error } = useEmailSendsList({
		page: search.page ?? 1,
		limit: search.limit ?? 10,
		search: search.search,
		status: search.status,
		type: search.type,
		source_type: search.source_type,
	});
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
			<div className="space-y-4">
				<Skeleton className="h-8 w-48" />
				{[1, 2, 3, 4, 5].map((n) => (
					<Skeleton key={n} className="h-12 w-full" />
				))}
			</div>
		);
	}
	if (isError) {
		return (
			<div className="space-y-4">
				<p className="text-destructive">
					{error instanceof Error ? error.message : "Error"}
				</p>
				<Button
					variant="outline"
					onClick={() =>
						navigate({ search: { ...search, page: 1, limit: 10 } })
					}
				>
					Reintentar
				</Button>
			</div>
		);
	}
	const rows = data?.data ?? [];
	const meta = data?.meta;
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-end flex-wrap gap-2">
				<Select
					value={search.type ?? "all"}
					onValueChange={(v) =>
						navigate({
							search: {
								...search,
								type: v === "all" ? undefined : (v as EmailSendType),
								page: 1,
							},
						})
					}
				>
					<SelectTrigger className="w-36">
						<SelectValue placeholder="Tipo" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Todos tipos</SelectItem>
						<SelectItem value="campaign">campaign</SelectItem>
						<SelectItem value="transactional">transactional</SelectItem>
						<SelectItem value="newsletter">newsletter</SelectItem>
						<SelectItem value="notification">notification</SelectItem>
						<SelectItem value="test">test</SelectItem>
					</SelectContent>
				</Select>
				<Select
					value={search.status ?? "all"}
					onValueChange={(v) =>
						navigate({
							search: {
								...search,
								status: v === "all" ? undefined : (v as EmailSendStatus),
								page: 1,
							},
						})
					}
				>
					<SelectTrigger className="w-36">
						<SelectValue placeholder="Estado" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Todos estados</SelectItem>
						{[
							"pending",
							"queued",
							"processing",
							"sent",
							"delivered",
							"opened",
							"clicked",
							"bounced",
							"failed",
							"cancelled",
						].map((s) => (
							<SelectItem key={s} value={s}>
								{s}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					value={search.source_type ?? "all"}
					onValueChange={(v) =>
						navigate({
							search: {
								...search,
								source_type: v === "all" ? undefined : v,
								page: 1,
							},
						})
					}
				>
					<SelectTrigger className="w-36">
						<SelectValue placeholder="Origen" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Todos orígenes</SelectItem>
						<SelectItem value="campaign">campaign</SelectItem>
						<SelectItem value="business">business</SelectItem>
						<SelectItem value="contact">contact</SelectItem>
					</SelectContent>
				</Select>
				<InputGroup className="max-w-sm">
					<InputGroupAddon align="inline-start">
						<Search className="size-4 text-muted-foreground" />
					</InputGroupAddon>
					<InputGroupInput
						placeholder="Buscar email..."
						value={searchInput}
						onChange={(e) => setSearchInput(e.target.value)}
					/>
				</InputGroup>
			</div>
			<DataTable
				columns={sendsColumns}
				data={rows}
				meta={meta}
				onPageChange={(page) => navigate({ search: { ...search, page } })}
				onLimitChange={(limit) =>
					navigate({ search: { ...search, page: 1, limit } })
				}
			/>
		</div>
	);
}
