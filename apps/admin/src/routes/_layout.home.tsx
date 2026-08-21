import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthUser } from "@/features/auth";

export const Route = createFileRoute("/_layout/home")({
	component: HomePage,
	head: () => ({
		meta: [
			{
				title: "Inicio | Role",
			},
			{
				name: "description",
				content: "Panel de inicio de Role - Resumen y gestión de tu plataforma",
			},
		],
	}),
});

function HomePage() {
	const { data: user, isLoading } = useAuthUser();

	if (isLoading) {
		return (
			<div className="w-full p-8 space-y-6">
				<Skeleton className="h-10 w-72" />
				<Skeleton className="h-6 w-56" />
				<div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
					{[1, 2, 3].map((n) => (
						<div key={n} className="rounded-lg border p-6 space-y-2">
							<Skeleton className="h-6 w-16" />
							<Skeleton className="h-8 w-12" />
							<Skeleton className="h-4 w-32" />
						</div>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="w-full p-8 space-y-6 rounded-lg">
			<h1 className="text-4xl font-bold">
				Bienvenido, {user?.full_name ?? user?.email ?? "Admin"}
			</h1>
			<p className="text-lg text-muted-foreground">
				Panel de administración de Role
			</p>

			<div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
				<div className="rounded-lg border p-6 space-y-2">
					<h2 className="text-xl font-semibold">Ofertas</h2>
					<p className="text-3xl font-bold">--</p>
					<p className="text-sm text-muted-foreground">Ofertas activas</p>
				</div>

				<div className="rounded-lg border p-6 space-y-2">
					<h2 className="text-xl font-semibold">Pedidos</h2>
					<p className="text-3xl font-bold">--</p>
					<p className="text-sm text-muted-foreground">Total de pedidos</p>
				</div>

				<div className="rounded-lg border p-6 space-y-2">
					<h2 className="text-xl font-semibold">Usuarios</h2>
					<p className="text-3xl font-bold">--</p>
					<p className="text-sm text-muted-foreground">Usuarios registrados</p>
				</div>
			</div>
		</div>
	);
}
