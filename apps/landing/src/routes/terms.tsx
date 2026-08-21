import { createFileRoute } from "@tanstack/react-router";

import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";

export const Route = createFileRoute("/terms")({
	component: TermsPage,
});

const SECTIONS = [
	{
		title: "Aceptación de los términos",
		body: "Al usar la app de Rolé aceptas estos términos y condiciones. Si no estás de acuerdo, por favor no uses el servicio.",
	},
	{
		title: "El servicio",
		body: "Rolé conecta comercios con excedente de comida con usuarios. Las ofertas son publicadas por los propios comercios y el contenido de cada bolsa puede variar.",
	},
	{
		title: "Reservas y pagos",
		body: "La reserva confirma tu lugar, pero el pago se realiza directamente en el comercio al momento de la recogida. Puedes cancelar sin costo antes del horario indicado.",
	},
	{
		title: "Responsabilidad del usuario",
		body: "Debes acudir al comercio dentro del horario de recogida. Las reservas no recogidas se liberan para otros usuarios y afectan tu historial.",
	},
	{
		title: "Responsabilidad de la plataforma",
		body: "Rolé actúa como intermediario y no es responsable del contenido específico de cada oferta ni de la calidad de los productos, que dependen de cada comercio.",
	},
	{
		title: "Cambios al servicio",
		body: "Podemos actualizar estos términos y el servicio en general. Los cambios importantes se notificarán a través de la app.",
	},
	{
		title: "Contacto",
		body: "Para cualquier consulta sobre estos términos, escríbenos a legal@role.app.",
	},
];

function TermsPage() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main id="main" className="mx-auto max-w-3xl px-6 pb-32 pt-28">
				<p className="text-sm font-semibold uppercase tracking-widest text-role-primary reveal">
					Legal
				</p>
				<h1 className="mt-3 font-heading text-4xl font-bold tracking-tight reveal reveal-delay-1">
					Términos y condiciones
				</h1>
				<p className="mt-4 text-sm text-role-muted-foreground reveal reveal-delay-2">
					Última actualización:{" "}
					{new Date().toLocaleDateString("es-MX", {
						year: "numeric",
						month: "long",
						day: "numeric",
					})}
				</p>
				<div className="mt-12 space-y-10 border-l border-role-border pl-8">
					{SECTIONS.map((s, i) => (
						<section key={s.title} className="reveal reveal-delay-${i + 3}">
							<h2 className="font-heading text-lg font-bold tracking-tight">
								{i + 1}. {s.title}
							</h2>
							<p className="mt-3 leading-relaxed text-role-foreground">
								{s.body}
							</p>
						</section>
					))}
				</div>
			</main>
			<Footer />
		</div>
	);
}
