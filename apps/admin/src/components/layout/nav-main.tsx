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

export function NavMain({ items }: { items: NavItem[] }) {
	const location = useLocation();
	const currentPath = location.pathname;

	return (
		<SidebarGroup className="w-full min-w-0">
			<SidebarGroupLabel>Acciones</SidebarGroupLabel>

			<SidebarMenu className="w-full">
				{items.map((item) => {
					const hasSubItems = !!item.items?.length;
					const isSubItemActive =
						hasSubItems &&
						item.items?.some((subItem) => currentPath === subItem.url);

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
								<ChevronRight className="ml-auto shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
							</CollapsibleTrigger>

							<CollapsibleContent className="w-full">
								<SidebarMenuSub className="w-full">
									{item.items?.map((subItem) => (
										<SidebarMenuSubItem key={subItem.title} className="w-full">
											<SidebarMenuSubButton
												className="w-full"
												render={<Link to={subItem.url} />}
												isActive={currentPath === subItem.url}
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
								isActive={currentPath === item.url}
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
