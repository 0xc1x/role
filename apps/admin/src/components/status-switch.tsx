import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

/** Fila Switch + Badge para campos booleanos "activo" (forms). */
export function StatusSwitch(props: {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	disabled?: boolean;
	activeLabel?: string;
	inactiveLabel?: string;
}) {
	const activeLabel = props.activeLabel ?? "Activo";
	const inactiveLabel = props.inactiveLabel ?? "Inactivo";
	return (
		<div className="flex items-center gap-3">
			<Switch
				checked={props.checked}
				onCheckedChange={props.onCheckedChange}
				disabled={props.disabled}
				aria-label={props.checked ? activeLabel : inactiveLabel}
				tone="status"
			/>
			<Badge variant={props.checked ? "success" : "destructive"}>
				{props.checked ? activeLabel : inactiveLabel}
			</Badge>
		</div>
	);
}
