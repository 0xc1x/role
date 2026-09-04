import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShoppingBag, Store, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthUser } from "@/features/auth";
import { businessesApi } from "@/features/businesses/api/businesses.api";
import { api } from "@/lib/api/client";

export const Route = createFileRoute("/_layout/home")({
	component: HomePage,
	head: () => ({
		meta: [
			{ title: "Inicio | Role" },
			{ name: "description", content: "Panel de inicio de Role" },
		],
	}),
});

type PlatformStats = { users: number; businesses: number; meals: number };

function usePlatformStats() {
	return useQuery<PlatformStats>({
		queryKey: ["platformStats"],
		queryFn: () => api.get<PlatformStats>("/stats/platform"),
		staleTime: 60_000,
	});
}

function HomePage() {
	const { data: user, isLoading: authLoading } = useAuthUser();
	const { data: stats, isLoading: statsLoading } = usePlatformStats();

	const { data: pendingData, isLoading: pendingLoading } = useQuery({
		queryKey: ["businesses", "pending-home"],
		queryFn: () =>
			businessesApi.list({
				verification_status: "pending",
				limit: 5,
				page: 1,
			} as never),
		staleTime: 30_000,
	});
	const { data: pendingMeta } = useQuery({
		queryKey: ["businesses", "pending-count"],
		queryFn: () =>
			businessesApi.list({
				verification_status: "pending",
				limit: 1,
				page: 1,
			} as never),
		staleTime: 30_000,
	});
	const { data: totalData } = useQuery({
		queryKey: ["businesses", "total"],
		queryFn: () => businessesApi.list({ limit: 1, page: 1 } as never),
		staleTime: 30_000,
	});
	const { data: emailsData } = useQuery({
		queryKey: ["email-sends", "pending-home"],
		queryFn: () =>
			api.get<{
				data: { id: string; email: string; type: string; status: string }[];
				meta: { total: number };
			}>(
				"/email-marketing/sends?status=pending&limit=5" as never,
			) as unknown as Promise<{
				data: { id: string; email: string; type: string; status: string }[];
				meta: { total: number };
			}>,
		staleTime: 30_000,
	});

	if (authLoading) {
		return (
			<div className="w-full p-8 space-y-6">
				<Skeleton className="h-10 w-72" />
				<div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-8">
					{[1, 2, 3, 4].map((n) => (
						<div key={n} className="rounded-lg border p-6 space-y-2">
							<Skeleton className="h-6 w-16" />
							<Skeleton className="h-8 w-12" />
						</div>
					))}
				</div>
			</div>
		);
	}

	const pendingCount =
		(pendingMeta as unknown as { meta?: { total: number } })?.meta?.total ??
		(pendingData as unknown as { meta?: { total: number } })?.meta?.total ??
		0;
	const totalBusinesses =
		(totalData as unknown as { meta?: { total: number } })?.meta?.total ??
		stats?.businesses ??
		0;
	const usersCount = stats?.users ?? 0;
	const mealsCount = stats?.meals ?? 0;

	return (
		<div className="w-full p-8 space-y-6">
			<div>
				<h1 className="text-3xl font-bold">
					Bienvenido, {user?.full_name ?? user?.email ?? "Admin"}
				</h1>
				<p className="text-muted-foreground">Resumen de tu plataforma</p>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-4 gap-6">
				<Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
					<CardHeader className="flex flex-row items-center justify-between pb-2">
						<CardTitle className="text-sm font-medium">Pendientes</CardTitle>
						<Store className="h-4 w-4 text-amber-600" />
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold">
							{statsLoading || pendingLoading ? (
								<Skeleton className="h-8 w-12" />
							) : (
								pendingCount
							)}
						</div>
						<p className="text-xs text-muted-foreground">
							Negocios por aprobar
						</p>
						<Link
							to="/negocios"
							search={{ verification_status: "pending" } as never}
							className="text-xs text-amber-600 hover:underline inline-flex items-center gap-1 mt-2"
						>
							Ver pendientes <ArrowRight className="h-3 w-3" />
						</Link>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between pb-2">
						<CardTitle className="text-sm font-medium">Negocios</CardTitle>
						<Store className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold">
							{statsLoading ? (
								<Skeleton className="h-8 w-12" />
							) : (
								totalBusinesses
							)}
						</div>
						<p className="text-xs text-muted-foreground">Total comercios</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between pb-2">
						<CardTitle className="text-sm font-medium">Usuarios</CardTitle>
						<Users className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold">
							{statsLoading ? <Skeleton className="h-8 w-12" /> : usersCount}+
						</div>
						<p className="text-xs text-muted-foreground">Usuarios activos</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between pb-2">
						<CardTitle className="text-sm font-medium">Comidas</CardTitle>
						<ShoppingBag className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold">
							{statsLoading ? <Skeleton className="h-8 w-12" /> : mealsCount}+
						</div>
						<p className="text-xs text-muted-foreground">Rescatadas</p>
					</CardContent>
				</Card>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between">
						<CardTitle>Negocios recientes pendientes</CardTitle>
						<Link
							to="/negocios"
							search={{ verification_status: "pending" } as never}
						>
							<Button variant="ghost" size="sm">
								Ver todo <ArrowRight className="ml-1 h-4 w-4" />
							</Button>
						</Link>
					</CardHeader>
					<CardContent>
						{(
							pendingData as unknown as {
								data?: { id: string; name: string; created_at: string }[];
							}
						)?.data?.length ? (
							<ul className="space-y-3">
								{(
									pendingData as unknown as {
										data: { id: string; name: string; created_at: string }[];
									}
								).data
									.slice(0, 5)
									.map((b) => (
										<li
											key={b.id}
											className="flex items-center justify-between border-b pb-2 last:border-0"
										>
											<span className="font-medium text-sm">{b.name}</span>
											<span className="text-xs text-muted-foreground">
												{new Date(b.created_at).toLocaleDateString("es-EC")}
											</span>
										</li>
									))}
							</ul>
						) : (
							<p className="text-sm text-muted-foreground">
								No hay pendientes — ¡todo al día!
							</p>
						)}
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between">
						<CardTitle>Emails en cola</CardTitle>
						<Link to="/emails-sends" search={{ status: "pending" } as never}>
							<Button variant="ghost" size="sm">
								Ver todo <ArrowRight className="ml-1 h-4 w-4" />
							</Button>
						</Link>
					</CardHeader>
					<CardContent>
						{(
							emailsData as unknown as {
								data?: {
									id: string;
									email: string;
									status: string;
									type: string;
								}[];
							}
						)?.data?.length ? (
							<ul className="space-y-3">
								{(
									emailsData as unknown as {
										data: {
											id: string;
											email: string;
											status: string;
											type: string;
										}[];
									}
								).data
									.slice(0, 5)
									.map((e) => (
										<li
											key={e.id}
											className="flex items-center justify-between border-b pb-2 last:border-0"
										>
											<span className="text-sm truncate max-w-[180px]">
												{e.email}
											</span>
											<Badge variant="secondary" className="text-xs">
												{e.status}
											</Badge>
										</li>
									))}
							</ul>
						) : (
							<p className="text-sm text-muted-foreground">Cola vacía</p>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
