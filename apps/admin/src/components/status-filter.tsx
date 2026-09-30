import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

/**
 * Filtro por estado de los listados del panel. Nace de los dos `<Select>` de
 * estado que Órdenes y Pagos tenían duplicados: same shape, same "all" option,
 * same explicit-children workaround for the trigger showing the raw enum.
 *
 * Vive en `components/` y no en `features/orders/` porque lo consumen dos dominios
 * sin relación: el filtro no sabe de órdenes ni de pagos, solo de estados. Mismo
 * criterio que `BusinessFilter`, que también cruza dominios.
 */
export function StatusFilter<TStatus extends string>({
	value,
	statuses,
	label,
	allLabel = "Todos los estados",
	onChange,
	ariaLabel = "Estado",
}: {
	value?: TStatus;
	statuses: readonly TStatus[];
	/** Del dominio: el enum crudo nunca llega a la etiqueta. */
	label: (status: TStatus) => string;
	allLabel?: string;
	onChange: (status: TStatus | undefined) => void;
	ariaLabel?: string;
}) {
	return (
		<Select
			value={value ?? "all"}
			onValueChange={(v) => onChange(v === "all" ? undefined : (v as TStatus))}
		>
			<SelectTrigger className="w-48" aria-label={ariaLabel}>
				{/* Con children explícitos: sin ellos el trigger muestra el enum
				    crudo (`ready_for_pickup`) en vez de la etiqueta. */}
				<SelectValue>{value ? label(value) : allLabel}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="all">{allLabel}</SelectItem>
				{statuses.map((status) => (
					<SelectItem key={status} value={status}>
						{label(status)}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
