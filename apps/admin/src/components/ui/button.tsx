import { Button as ButtonPrimitive } from "@base-ui/react/button";
import type { VariantProps } from "class-variance-authority";
import { isValidElement } from "react";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

function Button({
	className,
	variant = "default",
	size = "default",
	render,
	nativeButton,
	...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
	const resolvedNativeButton =
		nativeButton ??
		(isValidElement(render) && render.type !== "button" ? false : undefined);

	return (
		<ButtonPrimitive
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			render={render}
			nativeButton={resolvedNativeButton}
			{...props}
		/>
	);
}

export { Button };
