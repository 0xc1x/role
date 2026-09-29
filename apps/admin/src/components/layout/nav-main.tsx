import { Link, useLocation } from "@tanstack/react-router";
import { ChevronRight, type LucideIcon } from "lucide-react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "@/components/ui/sidebar";

type NavItem = {
	title: string;
	url: string;
	icon?: LucideIcon;
	isActive?: boolean;
	items?: {
		title: string;
		url: string;
	}[];
};

/**
 * Un ítem del menú está activo cuando su ruta es la que se está viendo.
 *
 * La comparación va sobre el PATHNAME y no sobre la URL completa porque las
 * superficies con pestañas cambian `?tab=` sin cambiar de ruta. Notificaciones
 * tiene cuatro (`enviar`, `plantillas`, `historial`, `dispositivos`) y el query
 * es toda la máquina de estado de esa pantalla: con la comparación completa,
 * cambiar de pestaña desmarcaba el ícono de Notificaciones y su sección se
 * cerraba, que es justo la mitad de lo que el operador está haciendo ahí.
 *
 * Un ítem que sí lleve query en su `url` tiene que coincidir entero, así que
 * ese caso conserva la comparación exacta. La regla no depende entonces de que
 * hoy ningún ítem del menú lleve query.
 */
export function isNavItemActive(
	itemUrl: string,
	pathname: string,
	currentUrl: string,
): boolean {
	return itemUrl.includes("?") ? currentUrl === itemUrl : pathname === itemUrl;
}

export function NavMain({ items }: { items: NavItem[] }) {
	const location = useLocation();
	// `currentUrl` sigue siendo la URL completa y se usa para los ítems que
	// declaran query; el pathname es lo que decide el resaltado de los que no.
	const searchString =
		typeof location.search === "string"
			? location.search
			: new URLSearchParams(
					(location.search ?? {}) as Record<string, string>,
				).toString();
	const pathname = location.pathname;
	const currentUrl = `${pathname}${searchString ? `?${searchString}` : ""}`;

	return (
		<SidebarGroup className="w-full min-w-0">
			<SidebarGroupLabel>Acciones</SidebarGroupLabel>

			<SidebarMenu className="w-full">
				{items.map((item) => {
					const hasSubItems = !!item.items?.length;
					const isSubItemActive =
						hasSubItems &&
						item.items?.some((subItem) =>
							isNavItemActive(subItem.url, pathname, currentUrl),
						);

					return hasSubItems ? (
						<Collapsible
							key={item.title}
							defaultOpen={item.isActive || isSubItemActive}
							className="group/collapsible w-full"
							render={<SidebarMenuItem className="w-full" />}
						>
							<CollapsibleTrigger
								render={
									<SidebarMenuButton
										tooltip={item.title}
										className="flex w-full min-w-0 items-center"
										isActive={isSubItemActive}
									/>
								}
							>
								{item.icon && <item.icon />}
								<span className="min-w-0 flex-1 truncate">{item.title}</span>
								<ChevronRight className="ml-auto shrink-0 transition-transform duration-200 group-data-[open]/collapsible:rotate-90" />
							</CollapsibleTrigger>

							<CollapsibleContent className="w-full">
								<SidebarMenuSub className="w-full">
									{item.items?.map((subItem) => (
										<SidebarMenuSubItem key={subItem.title} className="w-full">
											<SidebarMenuSubButton
												className="w-full"
												render={<Link to={subItem.url} />}
												isActive={isNavItemActive(
													subItem.url,
													pathname,
													currentUrl,
												)}
											>
												<span>{subItem.title}</span>
											</SidebarMenuSubButton>
										</SidebarMenuSubItem>
									))}
								</SidebarMenuSub>
							</CollapsibleContent>
						</Collapsible>
					) : (
						<SidebarMenuItem key={item.title} className="w-full">
							<SidebarMenuButton
								tooltip={item.title}
								className="flex w-full min-w-0 items-center"
								render={<Link to={item.url} />}
								isActive={isNavItemActive(item.url, pathname, currentUrl)}
							>
								{item.icon && <item.icon />}
								<span className="min-w-0 flex-1 truncate">{item.title}</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					);
				})}
			</SidebarMenu>
		</SidebarGroup>
	);
}
