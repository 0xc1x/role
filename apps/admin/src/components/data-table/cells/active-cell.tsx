import { Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

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
			<TooltipProvider delay={1000}>
				<Tooltip>
					<TooltipTrigger>
						<span className="inline-flex cursor-pointer items-center">
							<Switch
								checked={active}
								onCheckedChange={onToggle}
								disabled={isPending}
								aria-label={`${label} ${active ? "activa" : "inactiva"}`}
								className="data-checked:border-emerald-500 data-checked:bg-emerald-500 data-unchecked:border-red-500 data-unchecked:bg-red-500 dark:data-unchecked:border-red-600 dark:data-unchecked:bg-red-600"
							/>
						</span>
					</TooltipTrigger>
					<TooltipContent
						side="top"
						className="flex items-center gap-1.5 text-xs"
					>
						<span
							className={`size-1.5 rounded-full ${
								active ? "bg-emerald-500" : "bg-red-500"
							}`}
						/>
						{active ? `${label} activa` : `${label} inactiva`}
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			<span className="flex size-3.5 shrink-0 items-center justify-center">
				<Loader2
					className={`size-3.5 animate-spin text-muted-foreground transition-opacity ${
						isPending ? "opacity-100" : "opacity-0"
					}`}
				/>
			</span>
		</div>
	);
}
