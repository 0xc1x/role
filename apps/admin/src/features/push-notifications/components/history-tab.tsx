import type {
	PushNotificationDto,
	PushNotificationType,
} from "@0xc1x/role-commons";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { Loading } from "@/components/loading";
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
import { pushListOptions } from "@/features/push-notifications/queries/push.queries";
import { historyColumns } from "@/features/push-notifications/tables/history-columns";

export function HistoryTab() {
	const [page, setPage] = useState(1);
	const [limit, setLimit] = useState(10);
	const [search, setSearch] = useState("");
	const [type, setType] = useState<PushNotificationType | "all">("all");
	const { data, isLoading } = useQuery(
		pushListOptions.history({
			page,
			limit,
			search: search || undefined,
			type: type === "all" ? undefined : type,
		}),
	);

	if (isLoading) return <Loading />;
	const rows: PushNotificationDto[] = data?.data ?? [];

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between flex-wrap gap-2">
				<h2 className="font-bold text-lg">Historial de envíos</h2>
				<div className="flex items-center gap-2">
					<Select
						value={type}
						onValueChange={(v) => {
							if (!v) return;
							setType(v as PushNotificationType | "all");
							setPage(1);
						}}
					>
						<SelectTrigger className="w-36">
							<SelectValue placeholder="Tipo" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Todos tipos</SelectItem>
							<SelectItem value="announcement">announcement</SelectItem>
							<SelectItem value="promo">promo</SelectItem>
							<SelectItem value="system">system</SelectItem>
						</SelectContent>
					</Select>
					<InputGroup className="max-w-sm">
						<InputGroupAddon align="inline-start">
							<Search className="size-4 text-muted-foreground" />
						</InputGroupAddon>
						<InputGroupInput
							placeholder="Buscar título..."
							value={search}
							onChange={(e) => {
								setSearch(e.target.value);
								setPage(1);
							}}
						/>
					</InputGroup>
				</div>
			</div>
			<DataTable
				columns={historyColumns}
				data={rows}
				meta={data?.meta}
				onPageChange={setPage}
				onLimitChange={(l) => {
					setLimit(l);
					setPage(1);
				}}
			/>
		</div>
	);
}

// ─── Tab: dispositivos ────────────────────────────────────────────────
