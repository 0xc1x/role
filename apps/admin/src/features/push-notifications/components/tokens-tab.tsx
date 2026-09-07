import type { Platform } from "@0xc1x/role-commons";
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
import { tokenColumns } from "@/features/push-notifications/tables/tokens-columns";

export function TokensTab() {
	const [page, setPage] = useState(1);
	const [limit, setLimit] = useState(10);
	const [search, setSearch] = useState("");
	const [platform, setPlatform] = useState<Platform | "all">("all");
	const { data, isLoading } = useQuery(
		pushListOptions.tokens({
			page,
			limit,
			search: search || undefined,
			platform: platform === "all" ? undefined : platform,
			active: undefined,
		}),
	);

	if (isLoading) return <Loading />;

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between flex-wrap gap-2">
				<h2 className="font-bold text-lg">Dispositivos registrados</h2>
				<div className="flex items-center gap-2">
					<Select
						value={platform}
						onValueChange={(v) => {
							if (!v) return;
							setPlatform(v as Platform | "all");
							setPage(1);
						}}
					>
						<SelectTrigger className="w-36">
							<SelectValue placeholder="Plataforma" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Todas</SelectItem>
							<SelectItem value="ios">ios</SelectItem>
							<SelectItem value="android">android</SelectItem>
							<SelectItem value="web">web</SelectItem>
						</SelectContent>
					</Select>
					<InputGroup className="max-w-sm">
						<InputGroupAddon align="inline-start">
							<Search className="size-4 text-muted-foreground" />
						</InputGroupAddon>
						<InputGroupInput
							placeholder="Buscar usuario o token..."
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
				columns={tokenColumns}
				data={data?.data ?? []}
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
