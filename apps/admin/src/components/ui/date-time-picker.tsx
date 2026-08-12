"use client";

import { format, isValid, parse } from "date-fns";
import { CalendarIcon, XIcon } from "lucide-react";
import type { MouseEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import type { Matcher } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { TimePicker12h } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";

const DATE_TIME_FORMAT = "yyyy-MM-dd'T'HH:mm";

interface DateTimePickerProps {
	/** Valor controlado. Formato: yyyy-MM-dd'T'HH:mm */
	value?: string;
	onChange?: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	/** Fecha mínima seleccionable. */
	fromDate?: Date;
	/** Fecha máxima seleccionable. */
	toDate?: Date;
	/** Permite limpiar el valor. */
	clearable?: boolean;
	/** Cierra automáticamente al seleccionar la fecha. */
	closeOnSelect?: boolean;
	className?: string;
}

function parseValue(value?: string): Date | undefined {
	if (!value) return undefined;

	const strict = parse(value, DATE_TIME_FORMAT, new Date());
	if (isValid(strict)) return strict;

	const fallback = new Date(value);
	return isValid(fallback) ? fallback : undefined;
}

function mergeDateAndTime(date: Date, time: string) {
	const [hours, minutes] = time.split(":");
	if (!hours || !minutes) return date;

	const merged = new Date(date);
	merged.setHours(Number(hours), Number(minutes), 0, 0);
	return merged;
}

export function DateTimePicker({
	value = "",
	onChange,
	placeholder = "Seleccionar fecha y hora",
	disabled = false,
	fromDate,
	toDate,
	clearable = true,
	closeOnSelect = false,
	className,
}: DateTimePickerProps) {
	const [open, setOpen] = useState(false);

	const selectedDate = useMemo(() => parseValue(value), [value]);

	const displayValue = useMemo(() => {
		if (!selectedDate) return "";
		return format(selectedDate, "dd/MM/yyyy HH:mm");
	}, [selectedDate]);

	const timeValue = useMemo(() => {
		if (!selectedDate) return "00:00";
		return format(selectedDate, "HH:mm");
	}, [selectedDate]);

	const handleDaySelect = useCallback(
		(day: Date | undefined) => {
			if (!day) return;

			const current = selectedDate ?? new Date();
			const merged = new Date(day);
			merged.setHours(current.getHours(), current.getMinutes(), 0, 0);

			onChange?.(format(merged, DATE_TIME_FORMAT));

			if (closeOnSelect) {
				setOpen(false);
			}
		},
		[selectedDate, onChange, closeOnSelect],
	);

	const handleTimeChange = useCallback(
		(time: string) => {
			const base = selectedDate ?? new Date();
			const merged = mergeDateAndTime(base, time);
			onChange?.(format(merged, DATE_TIME_FORMAT));
		},
		[selectedDate, onChange],
	);

	const handleClear = useCallback(
		(event: MouseEvent<SVGSVGElement>) => {
			event.stopPropagation();
			onChange?.("");
		},
		[onChange],
	);

	const disabledMatcher: Matcher | undefined =
		fromDate || toDate
			? ({ before: fromDate, after: toDate } as Matcher)
			: undefined;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						type="button"
						variant="outline"
						disabled={disabled}
						data-empty={!displayValue}
						className={cn(
							"w-full justify-start gap-2 text-left font-normal data-[empty=true]:text-muted-foreground",
							className,
						)}
					/>
				}
			>
				<CalendarIcon className="size-4 shrink-0" />
				<span className="flex-1 truncate">{displayValue || placeholder}</span>
				{clearable && displayValue && !disabled && (
					<XIcon
						className="size-4 shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
						onClick={handleClear}
					/>
				)}
			</PopoverTrigger>

			<PopoverContent className="w-auto p-0" align="start">
				<div className="p-3">
					<Calendar
						mode="single"
						selected={selectedDate}
						onSelect={handleDaySelect}
						startMonth={fromDate ?? new Date(2020, 0)}
						endMonth={toDate ?? new Date(2035, 11)}
						captionLayout="dropdown-years"
						disabled={disabledMatcher}
					/>

					<div className="mt-4 border-t pt-4">
						<div className="flex items-center justify-between gap-2">
							<TimePicker12h
								value={timeValue}
								onChange={handleTimeChange}
								disabled={disabled}
							/>
							<Button type="button" size="sm" onClick={() => setOpen(false)}>
								Aceptar
							</Button>
						</div>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
