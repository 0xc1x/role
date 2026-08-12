import type * as React from "react";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { navMain, projects } from "@/config/navigation";
import { useAuthUser } from "@/features/auth";
import { NavMain } from "./nav-main";
import { NavProjects } from "./nav-projects";
import { NavUser } from "./nav-user";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const { data: user } = useAuthUser();

	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							size="lg"
							className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground [&_svg]:size-[unset]"
						>
							<Logo variant="icon" size={40} />
							<div className="grid flex-1 text-left text-sm leading-tight">
								<Logo
									variant="wordmark"
									className="h-5 w-auto text-sidebar-foreground"
								/>
								<span className="truncate text-xs text-sidebar-foreground/80">
									Panel de administración
								</span>
							</div>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<NavMain items={navMain} />
				<NavProjects projects={projects} />
			</SidebarContent>
			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<div className="flex items-center justify-center p-2">
							<ThemeToggle />
						</div>
					</SidebarMenuItem>
				</SidebarMenu>
				{user ? (
					<NavUser
						user={{
							name: user.full_name ?? user.email ?? "Admin",
							email: user.email ?? "",
							avatar: user.avatar_url ?? undefined,
						}}
					/>
				) : (
					<SidebarMenu>
						<SidebarMenuItem>
							<div className="flex items-center gap-3 px-3 py-2">
								<Skeleton className="h-8 w-8 rounded-lg" />
								<div className="grid flex-1 gap-1.5">
									<Skeleton className="h-4 w-24" />
									<Skeleton className="h-3 w-32" />
								</div>
								<Skeleton className="h-4 w-4" />
							</div>
						</SidebarMenuItem>
					</SidebarMenu>
				)}
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
