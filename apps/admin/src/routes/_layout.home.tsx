import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShoppingBag, Store, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthUser } from "@/features/auth";
import { useBusinessesList } from "@/features/businesses";
import { useEmailSendsList } from "@/features/email-sends";
import { usePlatformStats } from "@/features/stats";

export const Route = createFileRoute("/_layout/home")({
	component: HomePage,
	head: () => ({
		meta: [
			{ title: "Inicio | Role" },
			{ name: "description", content: "Panel de inicio de Role" },
		],
	}),
});

const PENDING_BUSINESSES_QUERY = {
	verification_status: "pending",
	limit: 5,
	page: 1,
} as const;

const PENDING_SENDS_QUERY = {
	status: "pending",
	limit: 5,
	page: 1,
} as const;

function HomePage() {
	const { data: user, isLoading: authLoading } = useAuthUser();
	const { data: stats, isLoading: statsLoading } = usePlatformStats();

	const { data: pendingData, isLoading: pendingLoading } = useBusinessesList(
		PENDING_BUSINESSES_QUERY,
	);
	const { data: pendingMeta } = useBusinessesList({
		verification_status: "pending",
		limit: 1,
		page: 1,
	});
	const { data: totalData } = useBusinessesList({ limit: 1, page: 1 });
	const { data: emailsData } = useEmailSendsList(PENDING_SENDS_QUERY);

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

	const pendingCount = pendingMeta?.meta.total ?? pendingData?.meta.total ?? 0;
	const totalBusinesses = totalData?.meta.total ?? stats?.businesses ?? 0;
	const usersCount = stats?.users ?? 0;
	const mealsCount = stats?.meals_saved ?? 0;
	const pendingBusinesses = (pendingData?.data ?? []).slice(0, 5);
	const queuedEmails = (emailsData?.data ?? []).slice(0, 5);

	return (
		<div className="w-full p-8 space-y-6">
			<div>
				<h1 className="text-3xl font-bold">
					Bienvenido, {user?.full_name ?? user?.email ?? "Admin"}
				</h1>
				<p className="text-muted-foreground">Resumen de tu plataforma</p>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-4 gap-6">
				<Card className="border-warning/30 bg-warning/5 dark:bg-warning/10">
					<CardHeader className="flex flex-row items-center justify-between pb-2">
						<CardTitle className="text-sm font-medium">Pendientes</CardTitle>
						<Store className="h-4 w-4 text-warning" />
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
							search={{ page: 1, limit: 10, verification_status: "pending" }}
							className="text-xs text-warning hover:underline inline-flex items-center gap-1 mt-2"
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
							search={{ page: 1, limit: 10, verification_status: "pending" }}
						>
							<Button variant="ghost" size="sm">
								Ver todo <ArrowRight className="ml-1 h-4 w-4" />
							</Button>
						</Link>
					</CardHeader>
					<CardContent>
						{pendingBusinesses.length ? (
							<ul className="space-y-3">
								{pendingBusinesses.map((b) => (
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
						<Link
							to="/notificaciones/mails"
							search={{ tab: "envios", status: "pending" }}
						>
							<Button variant="ghost" size="sm">
								Ver todo <ArrowRight className="ml-1 h-4 w-4" />
							</Button>
						</Link>
					</CardHeader>
					<CardContent>
						{queuedEmails.length ? (
							<ul className="space-y-3">
								{queuedEmails.map((e) => (
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
