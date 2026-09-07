import { X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useDirectory } from "@/features/directory";

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
				aria-label={`Buscar ${props.kind.toLowerCase()}`}
			/>
			<div
				role="listbox"
				aria-multiselectable
				aria-label={props.label}
				className="max-h-40 overflow-y-auto rounded-lg border"
			>
				{isLoading ? (
					<p className="p-2 text-xs text-muted-foreground">Buscando…</p>
				) : null}
				{!isLoading && options.length === 0 ? (
					<p className="p-2 text-xs text-muted-foreground">Sin resultados</p>
				) : null}
				{options.map((opt) => {
					const checked = props.selectedIds.includes(opt.id);
					return (
						<div
							key={opt.id}
							role="option"
							aria-selected={checked}
							tabIndex={0}
							onClick={() => toggle(opt.id)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									toggle(opt.id);
								}
							}}
							className="flex cursor-pointer items-center gap-2 border-b px-2 py-1.5 text-sm outline-none last:border-b-0 hover:bg-muted/50 focus-visible:bg-muted/50"
						>
							<Checkbox
								checked={checked}
								onCheckedChange={() => toggle(opt.id)}
								aria-label={opt.label}
							/>
							<span className="truncate">{opt.label}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
