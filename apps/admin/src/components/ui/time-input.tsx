"use client";

import type * as React from "react";
import { useCallback, useRef } from "react";

import { cn } from "@/lib/utils";

interface TimeInputProps {
	/** Valor controlado en formato "HH:mm" (24h) */
	value?: string;
	onChange?: (value: string) => void;
	disabled?: boolean;
	className?: string;
	"aria-label"?: string;
}

function clampWrap(n: number, max: number): number {
	return ((n % max) + max) % max;
}

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

/**
 * Input de hora estilizado (segmentos HH / MM) que reemplaza el
 * <input type="time"> nativo, cuyo aspecto no se puede personalizar
 * de forma consistente entre navegadores.
 */
function TimeInput({
	value = "",
	onChange,
	disabled = false,
	className,
	"aria-label": ariaLabel = "Hora",
}: TimeInputProps) {
	const [hh = "", mm = ""] = value.split(":");
	const hourRef = useRef<HTMLInputElement>(null);
	const minuteRef = useRef<HTMLInputElement>(null);

	const commit = useCallback(
		(nextHours: string, nextMinutes: string) => {
			onChange?.(
				`${pad(Number(nextHours || 0))}:${pad(Number(nextMinutes || 0))}`,
			);
		},
		[onChange],
	);

	const handleDigits = useCallback(
		(segment: "h" | "m") => (e: React.ChangeEvent<HTMLInputElement>) => {
			const digits = e.target.value.replace(/\D/g, "").slice(0, 2);

			if (segment === "h") {
				const clamped = Number(digits) > 23 ? "23" : digits;
				commit(clamped, mm || "00");
				if (clamped.length === 2) minuteRef.current?.select();
			} else {
				const clamped = Number(digits) > 59 ? "59" : digits;
				commit(hh || "00", clamped);
			}
		},
		[commit, hh, mm],
	);

	const step = useCallback(
		(segment: "h" | "m", delta: number) => {
			if (segment === "h") {
				commit(String(clampWrap(Number(hh || 0) + delta, 24)), mm || "00");
			} else {
				commit(hh || "00", String(clampWrap(Number(mm || 0) + delta, 60)));
			}
		},
		[commit, hh, mm],
	);

	const handleKeyDown = useCallback(
		(segment: "h" | "m") => (e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "ArrowUp") {
				e.preventDefault();
				step(segment, 1);
			} else if (e.key === "ArrowDown") {
				e.preventDefault();
				step(segment, -1);
			} else if (segment === "m" && e.key === "Backspace" && mm === "") {
				hourRef.current?.focus();
				hourRef.current?.select();
			} else if (
				segment === "h" &&
				(e.key === ":" || e.key === "ArrowRight") &&
				hh.length === 2
			) {
				e.preventDefault();
				minuteRef.current?.focus();
				minuteRef.current?.select();
			}
		},
		[step, hh, mm],
	);

	return (
		<div
			role="group"
			aria-label={ariaLabel}
			aria-disabled={disabled}
			className={cn(
				"flex h-8 items-center gap-0.5 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs transition-[color,box-shadow]",
				"focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
				disabled && "pointer-events-none cursor-not-allowed opacity-50",
				className,
			)}
		>
			<input
				ref={hourRef}
				type="text"
				inputMode="numeric"
				autoComplete="off"
				aria-label={`${ariaLabel} - horas`}
				value={hh}
				placeholder="HH"
				maxLength={2}
				disabled={disabled}
				onChange={handleDigits("h")}
				onKeyDown={handleKeyDown("h")}
				onFocus={(e) => e.currentTarget.select()}
				className="w-4.5 shrink-0 bg-transparent text-center tabular-nums outline-none placeholder:text-muted-foreground"
			/>
			<span aria-hidden className="text-muted-foreground">
				:
			</span>
			<input
				ref={minuteRef}
				type="text"
				inputMode="numeric"
				autoComplete="off"
				aria-label={`${ariaLabel} - minutos`}
				value={mm}
				placeholder="MM"
				maxLength={2}
				disabled={disabled}
				onChange={handleDigits("m")}
				onKeyDown={handleKeyDown("m")}
				onFocus={(e) => e.currentTarget.select()}
				className="w-4.5 shrink-0 bg-transparent text-center tabular-nums outline-none placeholder:text-muted-foreground"
			/>
		</div>
	);
}

export { TimeInput };
