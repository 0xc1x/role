"use client";

import { ClockIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

const HOURS_12 = Array.from({ length: 12 }, (_, i) =>
	String(i + 1).padStart(2, "0"),
);
const MINUTES = Array.from({ length: 60 }, (_, i) =>
	String(i).padStart(2, "0"),
);

export interface TimePicker12hProps {
	/** Formato esperado: "HH:mm" (24h) */
	value?: string;
	onChange: (value: string) => void;
	disabled?: boolean;
}

/**
 * Selector de hora en formato 12h con popover independiente.
 */
export function TimePicker12h({
	value = "00:00",
	onChange,
	disabled,
}: TimePicker12hProps) {
	const [open, setOpen] = useState(false);

	const { hour12, minutes, period } = useMemo(() => {
		const [hStr, mStr] = (value || "00:00").split(":");
		let h = Number.parseInt(hStr || "0", 10);
		const m = mStr || "00";

		const isPM = h >= 12;
		if (h === 0) h = 12;
		else if (h > 12) h -= 12;

		return {
			hour12: String(h).padStart(2, "0"),
			minutes: m,
			period: isPM ? "PM" : "AM",
		};
	}, [value]);

	const updateTime = (newHour: string, newMin: string, newPeriod: string) => {
		let h = Number.parseInt(newHour, 10);
		if (newPeriod === "PM" && h < 12) h += 12;
		if (newPeriod === "AM" && h === 12) h = 0;

		onChange(`${String(h).padStart(2, "0")}:${newMin}`);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={disabled}
						className="h-8 justify-start font-normal text-xs"
					/>
				}
			>
				<ClockIcon className="mr-1.5 size-3.5 text-muted-foreground" />
				<span>
					{hour12}:{minutes} {period}
				</span>
			</PopoverTrigger>

			<PopoverContent className="w-auto p-3" align="start" side="top">
				<div className="flex items-end gap-2">
					<div className="flex flex-col gap-1">
						<span className="text-[10px] font-medium text-muted-foreground">
							Hora
						</span>
						<Select
							value={hour12}
							onValueChange={(val) => {
								if (val) updateTime(val, minutes, period);
							}}
						>
							<SelectTrigger className="h-8 w-[70px] text-xs">
								<SelectValue placeholder="HH" />
							</SelectTrigger>
							<SelectContent
								side="bottom"
								sideOffset={4}
								className="max-h-48 w-[70px] min-w-[70px]"
							>
								{HOURS_12.map((h) => (
									<SelectItem key={h} value={h} className="text-xs">
										{h}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<span className="mb-2 text-xs font-bold text-muted-foreground">
						:
					</span>

					<div className="flex flex-col gap-1">
						<span className="text-[10px] font-medium text-muted-foreground">
							Minutos
						</span>
						<Select
							value={minutes}
							onValueChange={(val) => {
								if (val) updateTime(hour12, val, period);
							}}
						>
							<SelectTrigger className="h-8 w-[70px] text-xs">
								<SelectValue placeholder="MM" />
							</SelectTrigger>
							<SelectContent
								side="bottom"
								sideOffset={4}
								className="max-h-48 w-[70px] min-w-[70px]"
							>
								{MINUTES.map((m) => (
									<SelectItem key={m} value={m} className="text-xs">
										{m}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="flex flex-col gap-1">
						<span className="text-[10px] font-medium text-muted-foreground">
							Período
						</span>
						<Select
							value={period}
							onValueChange={(val) => {
								if (val) updateTime(hour12, minutes, val);
							}}
						>
							<SelectTrigger className="h-8 w-[70px] text-xs">
								<SelectValue placeholder="AM/PM" />
							</SelectTrigger>
							<SelectContent
								side="bottom"
								sideOffset={4}
								className="w-[70px] min-w-[70px]"
							>
								<SelectItem value="AM" className="text-xs">
									AM
								</SelectItem>
								<SelectItem value="PM" className="text-xs">
									PM
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
