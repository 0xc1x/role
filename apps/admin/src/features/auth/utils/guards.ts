import { redirect } from "@tanstack/react-router";
import { getToken } from "@/lib/api/client";

/**
 * Guardia para redireccionar a usuarios autenticados que intentan
 * acceder a páginas de invitados (Login, Signup, etc.)
 */
export const redirectIfAuthenticated = () => {
	if (typeof window !== "undefined" && getToken()) {
		throw redirect({ to: "/home" });
	}
};
