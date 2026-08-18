import { createFileRoute } from "@tanstack/react-router";

import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";

export const Route = createFileRoute("/terms")({
	component: TermsPage,
});

const SECTIONS = [
	{
		title: "1. Aceptación de los términos",
		body: "Al usar la app de Rolé aceptas estos términos y condiciones. Si no estás de acuerdo, por favor no uses el servicio.",
	},
	{
		title: "2. El servicio",
		body: "Rolé conecta comercios con excedente de comida con usuarios. Las ofertas son publicadas por los propios comercios y el contenido de cada bolsa puede variar.",
	},
	{
		title: "3. Reservas y pagos",
		body: "La reserva confirma tu lugar, pero el pago se realiza directamente en el comercio al momento de la recogida. Puedes cancelar sin costo antes del horario indicado.",
	},
	{
		title: "4. Responsabilidad del usuario",
		body: "Debes acudir al comercio dentro del horario de recogida. Las reservas no recogidas se liberan para otros usuarios y afectan tu historial.",
	},
	{
		title: "5. Responsabilidad de la plataforma",
		body: "Rolé actúa como intermediario y no es responsable del contenido específico de cada oferta ni de la calidad de los productos, que dependen de cada comercio.",
	},
	{
		title: "6. Cambios al servicio",
		body: "Podemos actualizar estos términos y el servicio en general. Los cambios importantes se notificarán a través de la app.",
	},
	{
		title: "7. Contacto",
		body: "Para cualquier consulta sobre estos términos, escríbenos a legal@role.app.",
	},
];

function TermsPage() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main className="mx-auto max-w-3xl px-6 py-20">
				<h1 className="font-heading text-4xl font-bold">
					Términos y condiciones
				</h1>
				<p className="mt-4 text-role-muted-foreground">
					Última actualización:{" "}
					{new Date().toLocaleDateString("es-MX", {
						year: "numeric",
						month: "long",
						day: "numeric",
					})}
				</p>
				<div className="mt-10 space-y-8">
					{SECTIONS.map((s) => (
						<section key={s.title}>
							<h2 className="font-heading text-xl font-bold">{s.title}</h2>
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
