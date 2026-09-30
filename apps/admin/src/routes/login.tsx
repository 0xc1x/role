import { createFileRoute } from "@tanstack/react-router";
import {
	LoginForm,
	redirectIfAuthenticated,
	useRequireGuest,
} from "@/features/auth";

/**
 * `from` es la ruta donde se cayó la sesión (ver `lib/api/session-expiry.ts`).
 * Solo se acepta una ruta interna: un `//host` o un `https://…` convertirían el
 * login en un redirector abierto.
 *
 * Las claves se omiten cuando no hay valor (no `from: undefined`): con el
 * search siempre presente, `navigate({ to: "/login" })` deja de compilar en cada
 * call site del panel.
 */
function sanitizeFrom(raw: unknown): string | undefined {
	if (typeof raw !== "string") return undefined;
	if (!raw.startsWith("/") || raw.startsWith("//")) return undefined;
	return raw;
}

type LoginSearch = { from?: string; reason?: "expired" };

export const Route = createFileRoute("/login")({
	validateSearch: (raw: Record<string, unknown>): LoginSearch => {
		const search: LoginSearch = {};
		const from = sanitizeFrom(raw.from);
		if (from) search.from = from;
		if (raw.reason === "expired") search.reason = "expired";
		return search;
	},
	beforeLoad: redirectIfAuthenticated,
	component: LoginPage,
	head: () => ({
		meta: [
			{ title: "Iniciar Sesión | Role" },
			{
				name: "description",
				content:
					"Inicia sesión en Role para acceder al panel de administración",
			},
		],
	}),
});

function LoginPage() {
	const { from, reason } = Route.useSearch();
	// Cubre la hidratación, que es donde `beforeLoad` no llega.
	useRequireGuest();
	return (
		<div className="flex justify-center items-center min-h-screen">
			<LoginForm sessionExpired={reason === "expired"} returnTo={from} />
		</div>
	);
}
