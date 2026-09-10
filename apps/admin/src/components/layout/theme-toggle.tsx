import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";

export function ThemeToggle() {
	const { setTheme } = useTheme();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<SidebarMenuButton className="w-full data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground" />
				}
			>
				<Sun className="size-4 rotate-0 scale-100 opacity-100 transition-[transform,opacity] dark:-rotate-90 dark:scale-50 dark:opacity-0" />
				<Moon className="absolute size-4 rotate-90 scale-50 opacity-0 transition-[transform,opacity] dark:rotate-0 dark:scale-100 dark:opacity-100" />
				{/* Oculto en sidebar colapsado: aunque overflow-hidden lo recorta,
				    seguía ocupando espacio en el flex (gap-2) y desplazaba el icono */}
				<span className="group-data-[collapsible=icon]:hidden">
					Cambiar tema
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={() => setTheme("light")}>
					Claro
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => setTheme("dark")}>
					Oscuro
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => setTheme("system")}>
					Sistema
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
