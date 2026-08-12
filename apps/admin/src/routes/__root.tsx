import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Scripts,
} from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { ThemeProvider } from "next-themes";
import { getQueryClient } from "@/config/query-client";
import appCss from "../styles.css?url";

const queryClient = getQueryClient();

import { TooltipProvider } from "@/components/ui/tooltip";

export interface RouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Role Admin",
			},
			{
				name: "description",
				content: "Panel de administración Role - Gestiona tu plataforma",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
			{
				rel: "icon",
				type: "image/svg+xml",
				href: "/icon.svg",
			},
		],
	}),
	notFoundComponent: () => (
		<div className="flex flex-col items-center justify-center min-h-screen gap-4">
			<h1 className="text-4xl font-bold">404</h1>
			<p className="text-muted-foreground">Página no encontrada</p>
			<Link to="/" className="text-primary hover:underline">
				Volver al inicio
			</Link>
		</div>
	),
	shellComponent: RootDocument,
});

const TanStackDevtools = lazy(() =>
	import("@tanstack/react-devtools").then((m) => ({
		default: m.TanStackDevtools,
	})),
);

const TanStackRouterDevtoolsPanel = lazy(() =>
	import("@tanstack/react-router-devtools").then((m) => ({
		default: m.TanStackRouterDevtoolsPanel,
	})),
);

function Devtools() {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) return null;

	return (
		<Suspense fallback={null}>
			<TanStackDevtools
				config={{
					position: "bottom-right",
				}}
				plugins={[
					{
						name: "Tanstack Router",
						render: <TanStackRouterDevtoolsPanel />,
					},
				]}
			/>
		</Suspense>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="es" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body>
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem
					disableTransitionOnChange
				>
					<QueryClientProvider client={queryClient}>
						<TooltipProvider>{children}</TooltipProvider>
					</QueryClientProvider>
				</ThemeProvider>
				<Devtools />
				<Scripts />
			</body>
		</html>
	);
}
