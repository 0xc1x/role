import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useState } from "react";
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
import { directoryApi } from "@/features/directory/api/directory.api";
import { directoryKeys } from "@/features/directory/queries/directory.keys";
import { useDebounce } from "@/hooks/use-debounce";

/**
 * Filtro por negocio del listado de órdenes. Reusa `directoryApi`/`directoryKeys`
 * en vez de crear un endpoint, y a diferencia del picker de campañas NO filtra
 * por `is_active`: una orden vieja pertenece a un negocio que puede estar
 * inactivo, y justo esas son las que hay que investigar.
 */
export function BusinessFilter({
	value,
	onChange,
}: {
	value?: string;
	onChange: (businessId: string | undefined) => void;
}) {
	const [search, setSearch] = useState("");
	const debounced = useDebounce(search);
	const params = { limit: 20, search: debounced || undefined };
	const { data, isFetching } = useQuery({
		queryKey: directoryKeys.businesses(params),
		queryFn: () => directoryApi.businesses(params),
		staleTime: 30_000,
	});

	const businesses = data?.data ?? [];
	const selected = businesses.find((b) => b.id === value);

	return (
		<div className="flex items-center gap-2">
			{value && !selected ? (
				<button
					type="button"
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm underline"
					onClick={() => onChange(undefined)}
				>
					<X className="size-3" /> {value.slice(0, 8)}… (quitar)
				</button>
			) : null}
			<InputGroup className="w-56">
				<InputGroupAddon align="inline-start">
					<Search className="size-4 text-muted-foreground" />
				</InputGroupAddon>
				<InputGroupInput
					placeholder="Filtrar por negocio..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					aria-label="Buscar negocio para filtrar las órdenes"
				/>
			</InputGroup>
			<Select
				value={selected?.id ?? "all"}
				onValueChange={(v) => onChange(!v || v === "all" ? undefined : v)}
			>
				<SelectTrigger className="w-48" aria-label="Negocio">
					{/* Con children explícitos: sin ellos el trigger muestra el
					    token crudo del valor ("all") en vez de la etiqueta. */}
					<SelectValue>
						{selected ? selected.name : "Todos los negocios"}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">Todos los negocios</SelectItem>
					{businesses.map((b) => (
						<SelectItem key={b.id} value={b.id}>
							{b.name}
						</SelectItem>
					))}
					{isFetching && businesses.length === 0 ? (
						<SelectItem value="loading" disabled>
							Buscando…
						</SelectItem>
					) : null}
				</SelectContent>
			</Select>
		</div>
	);
}
