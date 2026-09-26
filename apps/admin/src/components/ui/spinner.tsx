import { cn } from "@/lib/utils";

// A thin rotating arc (lucide Loader2 at size-4 => 1.33px stroke) sweeps its
// hard ends across the pixel grid, so it reads as off-axis wobble. A conic
// alpha ramp has no hard edge anywhere on the circle, so the ring stays put.
// ponytail: keeps the conic+mask hack; replace with a real SVG arc only if a
// designer asks for the lucide look back.
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
	return (
		<svg
			data-slot="spinner"
			role="status"
			aria-label="Loading"
			className={cn(
				"size-4 shrink-0 animate-spin rounded-full bg-[conic-gradient(from_90deg,transparent_0%,currentColor_12%,transparent_100%)] [mask-image:radial-gradient(farthest-side,#0000_calc(100%_-_2px),#000_calc(100%_-_2px))]",
				className,
			)}
			{...props}
		/>
	);
}

export { Spinner };
