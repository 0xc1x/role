import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface ActiveCellProps {
	active: boolean;
	onToggle: (checked: boolean) => void;
	isPending?: boolean;
	label: string;
}

export function ActiveCell({
	active,
	onToggle,
	isPending,
	label,
}: ActiveCellProps) {
	return (
		<div className="flex items-center gap-2">
			<Switch
				checked={active}
				onCheckedChange={onToggle}
				disabled={isPending}
				tone="status"
				aria-label={`${label} ${active ? "activa" : "inactiva"}`}
				title={active ? `${label} activa` : `${label} inactiva`}
			/>

			<span className="flex size-3.5 shrink-0 items-center justify-center">
				<Spinner
					className={cn(
						"transition-opacity",
						isPending ? "opacity-100" : "opacity-0",
					)}
				/>
			</span>
		</div>
	);
}
