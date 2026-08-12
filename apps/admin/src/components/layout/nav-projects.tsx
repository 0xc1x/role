import { Link, useLocation } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavProjects({
	projects,
}: {
	projects: {
		name: string;
		url: string;
		icon: LucideIcon;
	}[];
}) {
	const location = useLocation();
	const currentPath = location.pathname;

	return (
		<SidebarGroup>
			<SidebarGroupLabel>Administrables</SidebarGroupLabel>
			<SidebarMenu>
				{projects.map((item) => (
					<SidebarMenuItem key={item.name}>
						<SidebarMenuButton
							render={<Link to={item.url} />}
							isActive={currentPath === item.url}
						>
							<item.icon />
							<span>{item.name}</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				))}
			</SidebarMenu>
		</SidebarGroup>
	);
}
