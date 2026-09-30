import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Contenedor de notificaciones. Debe montarse UNA sola vez en el documento raíz:
 * los `toast.*` de toda la app son no-ops sin él.
 */
export function Toaster({ ...props }: ToasterProps) {
	const { theme = "system" } = useTheme();

	return (
		<Sonner
			theme={theme as ToasterProps["theme"]}
			className="toaster group"
			position="top-right"
			richColors
			{...props}
		/>
	);
}
