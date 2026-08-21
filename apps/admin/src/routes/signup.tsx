import { createFileRoute } from "@tanstack/react-router";
import { redirectIfAuthenticated, SignupForm } from "@/features/auth";

export const Route = createFileRoute("/signup")({
	beforeLoad: redirectIfAuthenticated,
	component: RouteComponent,
	head: () => ({
		meta: [
			{
				title: "Registrarse | Role",
			},
			{
				name: "description",
				content:
					"Crea tu cuenta en Role para gestionar el panel de administración",
			},
		],
	}),
});

function RouteComponent() {
	return (
		<div className="flex justify-center items-center min-h-screen">
			<SignupForm />
		</div>
	);
}
