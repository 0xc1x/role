import {
	createFileRoute,
	Outlet,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";
import Layout from "@/components/layout/layout";
import { Skeleton } from "@/components/ui/skeleton";
import {
	authKeys,
	clearAuth,
	getToken,
	useAuthUser,
	useRequireSession,
} from "@/features/auth";

export const Route = createFileRoute("/_layout")({
	beforeLoad: ({ context }) => {
		if (typeof window === "undefined") return;
		const token = getToken();
		if (!token) {
			throw redirect({ to: "/login" });
		}
		const user = context.queryClient.getQueryData(authKeys.me()) as
			| { role?: string }
			| undefined;
		if (user && user.role !== "admin") {
			clearAuth();
			context.queryClient.clear();
			throw redirect({ to: "/login" });
		}
	},
	component: RouteComponent,
	head: () => ({
		meta: [
			{ title: "Role Admin" },
			{ name: "description", content: "Panel de administración Role" },
		],
	}),
});

function RouteComponent() {
	const { data: user, isLoading, isError } = useAuthUser();
	const navigate = useNavigate();
	const hasToken = Boolean(getToken());

	// La mitad del guard que `beforeLoad` no cubre: la hidratación inicial.
	useRequireSession();

	useEffect(() => {
		if (isError) {
			clearAuth();
			navigate({ to: "/login" });
			return;
		}
		if (!isLoading && user && user.role !== "admin") {
			clearAuth();
			navigate({ to: "/login" });
		}
	}, [user, isLoading, isError, navigate]);

	if (isLoading || isError || !hasToken || !user || user.role !== "admin") {
		return <SessionPending />;
	}

	return (
		<Layout>
			<Outlet />
		</Layout>
	);
}

/**
 * Lo que se ve mientras no hay sesión utilizable.
 *
 * Sin sesión no hay panel que renderizar, y `useRequireSession` ya está
 * navegando al login. Antes esta rama devolvía `null` sin más, y ese `null` era
 * indistinguible de "cargando": el deep-link anónimo se quedaba en blanco para
 * siempre. El skeleton mantiene la pantalla viva durante la redirección sin
 * prometer datos que nunca van a llegar.
 */
function SessionPending() {
	return (
		<div className="flex items-center justify-center min-h-screen">
			<div className="flex flex-col items-center gap-4">
				<Skeleton className="h-12 w-48" />
				<Skeleton className="h-4 w-32" />
			</div>
		</div>
	);
}
