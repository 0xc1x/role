import { Input as InputPrimitive } from "@base-ui/react/input";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<InputPrimitive
			type={type}
			data-slot="input"
			className={cn(
				// `border-sage` (#7e7391), no `border-transparent`: el borde del
				// campo es lo que le dice al usuario de baja visión dónde está
				// la frontera, y WCAG 1.4.11 pide 3:1 para ella. Con el borde
				// transparente solo queda `bg-input/50` contra el fondo de la
				// página, que da 1.06:1. sage da 4.20:1 sobre `role-background`
				// y 4.26:1 sobre `cream`, los dos fondos donde se usa.
				"h-9 w-full min-w-0 rounded-3xl border border-sage bg-input/50 px-3 py-1 text-base transition-[color,box-shadow,background-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
