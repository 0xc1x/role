import type { PaginatedData, ProfileDto } from "@0xc1x/role-commons";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { toSearchParams } from "@/lib/api/http";

interface BusinessDto {
	id: string;
	name: string;
	email?: string;
}

interface PickerOption {
	id: string;
	label: string;
}

function useDirectory(
	kind: "usuarios" | "negocios",
	search: string,
	subscribedTo?: string,
	withPushToken?: boolean,
): { options: PickerOption[]; isLoading: boolean } {
	const debounced = useDebounce(search);
	const profiles = useQuery({
		queryKey: [
			"directory",
			"profiles",
			kind,
			debounced,
			subscribedTo,
			withPushToken,
		],
		queryFn: () =>
			api.get<PaginatedData<ProfileDto>>(
				`/profiles${toSearchParams({
					limit: 10,
					search: debounced || undefined,
					subscribed_to: subscribedTo,
					has_active_push_token: withPushToken || undefined,
				})}`,
			),
		enabled: kind === "usuarios",
	});
	const businesses = useQuery({
		queryKey: ["directory", "businesses", kind, debounced],
		queryFn: () =>
			api.get<PaginatedData<BusinessDto>>(
				`/businesses${toSearchParams({ limit: 10, search: debounced || undefined, is_active: true })}`,
			),
		enabled: kind === "negocios",
	});

	if (kind === "usuarios") {
		return {
			options: (profiles.data?.data ?? []).map((p) => ({
				id: p.id,
				label: `${p.full_name ?? "Sin nombre"} · ${p.email}`,
			})),
			isLoading: profiles.isFetching,
		};
	}
	return {
		options: (businesses.data?.data ?? []).map((b) => ({
			id: b.id,
			label: b.name,
		})),
		isLoading: businesses.isFetching,
	};
}

function useDebounce(value: string): string {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setDebounced(value), 300);
		return () => clearTimeout(t);
	}, [value]);
	return debounced;
}

/**
 * Multi-select de usuarios/negocios con búsqueda.
 * Reemplaza los textareas de UUIDs en campañas y segmentos estáticos.
 */
export function IdPicker(props: {
	label: string;
	kind: "usuarios" | "negocios";
	selectedIds: string[];
	onChange: (ids: string[]) => void;
	/** Solo muestra perfiles suscritos a esta categoría de marketing. */
	subscribedTo?: string;
	/** Solo muestra perfiles con device token de push activo (para envíos push). */
	withPushToken?: boolean;
}) {
	const [search, setSearch] = useState("");
	const { options, isLoading } = useDirectory(
		props.kind,
		search,
		props.subscribedTo,
		props.withPushToken,
	);

	const toggle = (id: string) =>
		props.onChange(
			props.selectedIds.includes(id)
				? props.selectedIds.filter((x) => x !== id)
				: [...props.selectedIds, id],
		);

	return (
		<div className="space-y-2">
			{props.selectedIds.length > 0 ? (
				<div className="flex flex-wrap gap-1.5">
					{props.selectedIds.map((id) => (
						<Badge
							key={id}
							variant="secondary"
							className="gap-1 font-mono text-[10px]"
						>
							{id.slice(0, 8)}…
							<button
								type="button"
								onClick={() => toggle(id)}
								aria-label={`Quitar ${id}`}
							>
								<X className="size-3" />
							</button>
						</Badge>
					))}
				</div>
			) : null}
			<Input
				value={search}
				onChange={(e) => setSearch(e.target.value)}
				placeholder={`Buscar ${props.kind.toLowerCase()}…`}
			/>
			<div className="max-h-40 overflow-y-auto rounded-lg border">
				{isLoading ? (
					<p className="p-2 text-xs text-muted-foreground">Buscando…</p>
				) : null}
				{!isLoading && options.length === 0 ? (
					<p className="p-2 text-xs text-muted-foreground">Sin resultados</p>
				) : null}
				{options.map((opt) => {
					const checked = props.selectedIds.includes(opt.id);
					return (
						<label
							key={opt.id}
							className="flex cursor-pointer items-center gap-2 border-b px-2 py-1.5 text-sm last:border-b-0 hover:bg-muted/50"
						>
							<input
								type="checkbox"
								checked={checked}
								onChange={() => toggle(opt.id)}
							/>
							<span className="truncate">{opt.label}</span>
						</label>
					);
				})}
			</div>
		</div>
	);
}
