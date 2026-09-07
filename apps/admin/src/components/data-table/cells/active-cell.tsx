import { Spinner } from "@/components/ui/spinner";
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
					<TooltipTrigger
						render={
							<span className="inline-flex cursor-pointer items-center" />
						}
					>
						<Switch
							checked={active}
							onCheckedChange={onToggle}
							disabled={isPending}
							aria-label={`${label} ${active ? "activa" : "inactiva"}`}
							className="data-checked:border-success data-checked:bg-success data-unchecked:border-destructive data-unchecked:bg-destructive"
						/>
					</TooltipTrigger>
					<TooltipContent
						side="top"
						className="flex items-center gap-1.5 text-xs"
					>
						<span
							className={`size-1.5 rounded-full ${
								active ? "bg-success" : "bg-destructive"
							}`}
						/>
						{active ? `${label} activa` : `${label} inactiva`}
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			<span className="flex size-3.5 shrink-0 items-center justify-center">
				<Spinner
					className={`transition-opacity ${
						isPending ? "opacity-100" : "opacity-0"
					}`}
				/>
			</span>
		</div>
	);
}
