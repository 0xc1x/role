import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export default function Layout({ children }: { children: React.ReactNode }) {
	return (
		<SidebarProvider>
			<AppSidebar />
			<main className="flex-1 min-w-0 max-w-full min-h-screen overflow-x-clip bg-background">
				<SidebarTrigger />
				{children}
			</main>
		</SidebarProvider>
	);
}
