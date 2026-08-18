import { createFileRoute } from "@tanstack/react-router";

import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";

export const Route = createFileRoute("/help-center")({
	component: HelpCenterPage,
});

const TOPICS = [
	{
		icon: "🍞",
		title: "Sobre las ofertas",
		body: "Cada oferta muestra su contenido aproximado, el horario de recogida y el descuento. El contenido exacto puede variar según la disponibilidad del día.",
	},
	{
		icon: "📦",
		title: "Reservas y recogida",
		body: "Al confirmar recibes un código único. Preséntalo en el comercio dentro del horario indicado. No olvides que la comida se reserva, el pago se hace al recoger.",
	},
	{
		icon: "↩️",
		title: "Cancelaciones y reembolsos",
		body: "Puedes cancelar tu reserva antes del horario de recogida desde la pestaña de pedidos. No hay cargos por cancelar ya que el pago se realiza en el comercio.",
	},
	{
		icon: "🏪",
		title: "Para comercios",
		body: "Publica tu excedente en minutos, gestiona horarios, revisa tus estadísticas y recibe pagos de forma sencilla desde el panel de negocio.",
	},
	{
		icon: "🔒",
		title: "Cuenta y privacidad",
		body: "Gestiona tus datos, preferencias de notificaciones y métodos de pago desde tu perfil. Consulta nuestra política de privacidad para más detalle.",
	},
];

function HelpCenterPage() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main className="mx-auto max-w-3xl px-6 py-20">
				<div className="text-center">
					<h1 className="font-heading text-4xl font-bold">Centro de ayuda</h1>
					<p className="mt-4 text-lg text-role-muted-foreground">
						Encuentra respuestas a las preguntas más comunes.
					</p>
				</div>
				<div className="mt-14 space-y-5">
					{TOPICS.map((t) => (
						<details
							key={t.title}
							className="rounded-2xl border border-role-border bg-white px-6 py-5 [&_summary::-webkit-details-marker]:hidden"
						>
							<summary className="cursor-pointer select-none font-heading text-base font-bold">
								<span className="mr-2">{t.icon}</span>
								{t.title}
							</summary>
							<p className="mt-3 leading-relaxed text-role-muted-foreground">
								{t.body}
							</p>
						</details>
					))}
				</div>
				<div className="mt-16 rounded-2xl bg-role-muted p-8 text-center">
					<h2 className="font-heading text-xl font-bold">
						¿Aún necesitas ayuda?
					</h2>
					<p className="mt-2 text-role-muted-foreground">
						Escríbenos a{" "}
						<a
							href="mailto:hola@role.app"
							className="text-role-primary hover:underline"
						>
							hola@role.app
						</a>{" "}
						y te responderemos lo antes posible.
					</p>
				</div>
			</main>
			<Footer />
		</div>
	);
}
