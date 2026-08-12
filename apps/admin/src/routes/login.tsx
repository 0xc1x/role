import { createFileRoute } from "@tanstack/react-router";
import { LoginForm, redirectIfAuthenticated } from "@/features/auth";
export const Route = createFileRoute("/login")({
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
	return (
		<div className="flex justify-center items-center min-h-screen">
			<LoginForm />
		</div>
	);
}
