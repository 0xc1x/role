"use client";

import { Pipette } from "lucide-react";
import type { MouseEvent, TouchEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

// --- Conversión HSVA <-> HEX ---

interface HSVA {
	h: number; // 0-360
	s: number; // 0-100
	v: number; // 0-100
	a: number; // 0-1
}

function hexToHsva(hexStr: string): HSVA {
	let hex = hexStr.replace(/^#/, "");
	if (hex.length === 3) {
		hex = hex
			.split("")
			.map((char) => char + char)
			.join("");
	}
	if (hex.length === 6) {
		hex += "FF";
	}

	const num = Number.parseInt(hex, 16);
	if (Number.isNaN(num)) return { h: 0, s: 100, v: 100, a: 1 };

	const r = ((num >> 24) & 255) / 255;
	const g = ((num >> 16) & 255) / 255;
	const b = ((num >> 8) & 255) / 255;
	const a = (num & 255) / 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;

	let h = 0;
	const s = max === 0 ? 0 : (d / max) * 100;
	const v = max * 100;

	if (max !== min) {
		switch (max) {
			case r:
				h = (g - b) / d + (g < b ? 6 : 0);
				break;
			case g:
				h = (b - r) / d + 2;
				break;
			case b:
				h = (r - g) / d + 4;
				break;
		}
		h /= 6;
	}

	return { h: Math.round(h * 360), s: Math.round(s), v: Math.round(v), a };
}

function hsvaToHex({ h, s, v, a }: HSVA, withAlpha = false): string {
	const sNorm = s / 100;
	const vNorm = v / 100;

	const c = vNorm * sNorm;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = vNorm - c;

	let r = 0;
	let g = 0;
	let b = 0;

	if (h >= 0 && h < 60) {
		r = c;
		g = x;
		b = 0;
	} else if (h >= 60 && h < 120) {
		r = x;
		g = c;
		b = 0;
	} else if (h >= 120 && h < 180) {
		r = 0;
		g = c;
		b = x;
	} else if (h >= 180 && h < 240) {
		r = 0;
		g = x;
		b = c;
	} else if (h >= 240 && h < 300) {
		r = x;
		g = 0;
		b = c;
	} else if (h >= 300 && h < 360) {
		r = c;
		g = 0;
		b = x;
	}

	const toHex = (n: number) =>
		Math.round((n + m) * 255)
			.toString(16)
			.padStart(2, "0");

	const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();

	if (withAlpha && a < 1) {
		const alphaHex = Math.round(a * 255)
			.toString(16)
			.padStart(2, "0")
			.toUpperCase();
		return `${hex}${alphaHex}`;
	}

	return hex;
}

const PRESET_COLORS = [
	"#000000",
	"#FFFFFF",
	"#64748B",
	"#EF4444",
	"#F97316",
	"#F59E0B",
	"#10B981",
	"#06B6D4",
	"#3B82F6",
	"#6366F1",
	"#8B5CF6",
	"#EC4899",
];

/**
 * Base UI Slider puede entregar un número o un arreglo [number].
 * Desestructurar un número lanza "is not iterable".
 */
function firstSliderValue(v: number | readonly number[]): number {
	return Array.isArray(v) ? v[0] : v;
}

// --- Área 2D Saturación / Valor ---

interface SaturationAreaProps {
	hsva: HSVA;
	onChange: (s: number, v: number) => void;
}

function SaturationArea({ hsva, onChange }: SaturationAreaProps) {
	const containerRef = useRef<HTMLDivElement>(null);

	const handleMove = useCallback(
		(event: globalThis.MouseEvent | globalThis.TouchEvent) => {
			if (!containerRef.current) return;
			const rect = containerRef.current.getBoundingClientRect();
			const clientX =
				"touches" in event ? event.touches[0].clientX : event.clientX;
			const clientY =
				"touches" in event ? event.touches[0].clientY : event.clientY;

			const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
			const y = Math.max(0, Math.min(rect.height, clientY - rect.top));

			const s = Math.round((x / rect.width) * 100);
			const v = Math.round((1 - y / rect.height) * 100);

			onChange(s, v);
		},
		[onChange],
	);

	const handlePointerDown = (e: MouseEvent | TouchEvent) => {
		handleMove(e.nativeEvent);

		const onPointerMove = (
			event: globalThis.MouseEvent | globalThis.TouchEvent,
		) => handleMove(event);
		const onPointerUp = () => {
			window.removeEventListener("mousemove", onPointerMove);
			window.removeEventListener("mouseup", onPointerUp);
			window.removeEventListener("touchmove", onPointerMove);
			window.removeEventListener("touchend", onPointerUp);
		};

		window.addEventListener("mousemove", onPointerMove);
		window.addEventListener("mouseup", onPointerUp);
		window.addEventListener("touchmove", onPointerMove);
		window.addEventListener("touchend", onPointerUp);
	};

	const pureHueHex = hsvaToHex({ h: hsva.h, s: 100, v: 100, a: 1 });

	return (
		<div
			ref={containerRef}
			className="relative h-36 w-full cursor-crosshair select-none overflow-hidden rounded-md"
			style={{ backgroundColor: pureHueHex }}
			onMouseDown={handlePointerDown}
			onTouchStart={handlePointerDown}
		>
			<div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
			<div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
			<div
				className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md transition-transform"
				style={{
					left: `${hsva.s}%`,
					top: `${100 - hsva.v}%`,
					backgroundColor: hsvaToHex(hsva),
				}}
			/>
		</div>
	);
}

// --- ColorPicker ---

interface ColorPickerProps {
	value?: string;
	onChange?: (value: string) => void;
	onBlur?: () => void;
	disabled?: boolean;
	className?: string;
	/**
	 * Si es true, emite #RRGGBBAA cuando alpha < 1.
	 * Por defecto false para alinear con HexColorSchema de role-commons (#RGB / #RRGGBB).
	 */
	withAlpha?: boolean;
}

export function ColorPicker({
	value = "#3B82F6",
	onChange,
	onBlur,
	disabled = false,
	className,
	withAlpha = false,
}: ColorPickerProps) {
	const [open, setOpen] = useState(false);
	const [hsva, setHsva] = useState<HSVA>(() => hexToHsva(value || "#000000"));

	useEffect(() => {
		if (value) {
			setHsva(hexToHsva(value));
		}
	}, [value]);

	const updateColor = (newHsva: HSVA) => {
		setHsva(newHsva);
		onChange?.(hsvaToHex(newHsva, withAlpha));
	};

	const displayHex = hsvaToHex(hsva, withAlpha);

	return (
		<div className={cn("flex items-center gap-2", className)}>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger
					render={
						<Button
							type="button"
							variant="outline"
							disabled={disabled}
							className="h-9 w-full justify-start gap-2 px-2.5 font-normal"
						/>
					}
				>
					<span
						className="size-5 shrink-0 rounded-md border border-black/10 shadow-sm"
						style={{ backgroundColor: displayHex }}
					/>
					<span className="font-mono text-xs uppercase">{displayHex}</span>
				</PopoverTrigger>

				<PopoverContent className="w-64 space-y-3 p-3" align="start">
					<SaturationArea
						hsva={hsva}
						onChange={(s, v) => updateColor({ ...hsva, s, v })}
					/>

					<div className="space-y-1">
						<span className="text-[10px] font-medium text-muted-foreground uppercase">
							Tono
						</span>
						<div className="relative flex items-center">
							<Slider
								min={0}
								max={360}
								step={1}
								value={[hsva.h]}
								onValueChange={(v) => {
									const h = firstSliderValue(v);
									updateColor({ ...hsva, h });
								}}
								className="[&_[data-slot=slider-thumb]]:border-white [&_[data-slot=slider-thumb]]:shadow-md [&_[data-slot=slider-track]]:h-3 [&_[data-slot=slider-track]]:bg-transparent [&_[data-slot=slider-range]]:bg-transparent"
								style={{
									background:
										"linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
									borderRadius: "6px",
								}}
							/>
						</div>
					</div>

					{withAlpha && (
						<div className="space-y-1">
							<span className="text-[10px] font-medium text-muted-foreground uppercase">
								Opacidad
							</span>
							<div className="relative flex w-full items-center">
								<Slider
									min={0}
									max={100}
									step={1}
									value={[Math.round(hsva.a * 100)]}
									onValueChange={(v) => {
										const aNorm = firstSliderValue(v);
										updateColor({ ...hsva, a: aNorm / 100 });
									}}
									className="[&_[data-slot=slider-thumb]]:border-white [&_[data-slot=slider-thumb]]:shadow-md [&_[data-slot=slider-track]]:h-3 [&_[data-slot=slider-track]]:bg-transparent [&_[data-slot=slider-range]]:bg-transparent"
									style={{
										background: `linear-gradient(to right, transparent, ${hsvaToHex(
											{ ...hsva, a: 1 },
										)})`,
										borderRadius: "6px",
									}}
								/>
							</div>
						</div>
					)}

					<div className="flex items-center gap-2 pt-1">
						{typeof window !== "undefined" && "EyeDropper" in window && (
							<Button
								type="button"
								variant="outline"
								size="icon"
								className="size-8 shrink-0"
								onClick={async () => {
									try {
										// EyeDropper aún no está en los tipos DOM estándar de TS.
										// @ts-expect-error EyeDropper API
										const eyeDropper = new window.EyeDropper();
										const result = await eyeDropper.open();
										if (result?.sRGBHex) {
											updateColor(hexToHsva(result.sRGBHex));
										}
									} catch {
										// Usuario canceló la selección
									}
								}}
								title="Seleccionar del navegador"
							>
								<Pipette className="size-3.5 text-muted-foreground" />
							</Button>
						)}

						<Input
							value={displayHex}
							onChange={(e) => {
								const next = e.target.value;
								setHsva(hexToHsva(next));
								onChange?.(next);
							}}
							onBlur={() => onBlur?.()}
							placeholder="#000000"
							className="h-8 font-mono text-xs uppercase"
						/>
					</div>

					<div className="grid grid-cols-6 gap-1.5 border-t border-border pt-1">
						{PRESET_COLORS.map((preset) => (
							<button
								key={preset}
								type="button"
								className="size-6 rounded-md border border-black/10 transition-transform hover:scale-110 focus:outline-none focus:ring-1 focus:ring-ring"
								style={{ backgroundColor: preset }}
								onClick={() => updateColor(hexToHsva(preset))}
							/>
						))}
					</div>
				</PopoverContent>
			</Popover>
		</div>
	);
}
