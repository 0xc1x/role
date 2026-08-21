import { createFileRoute } from "@tanstack/react-router";

import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { useConfig } from "@/lib/use-config";

export const Route = createFileRoute("/privacy")({
	component: PrivacyPage,
});

const SECTIONS = [
	{
		title: "Información que recopilamos",
		body: "Recopilamos la información que nos proporcionas al crear tu cuenta (nombre, correo, ubicación aproximada) y la información de uso de la app (ofertas vistas, reservas realizadas) para mejorar el servicio.",
	},
	{
		title: "Uso de la información",
		body: "Usamos tus datos para procesar reservas, coordinar recogidas, mostrarte ofertas relevantes cerca de ti y enviarte notificaciones sobre tus pedidos. Nunca vendemos tu información personal.",
	},
	{
		title: "Compartir con terceros",
		body: "Compartimos únicamente los datos necesarios con los comercios para completar tu reserva y con nuestros proveedores de infraestructura (almacenamiento, notificaciones, pagos).",
	},
	{
		title: "Tus derechos",
		body: "Puedes acceder, corregir o eliminar tus datos personales en cualquier momento desde la app o contactándonos. Puedes desactivar las notificaciones cuando quieras.",
	},
	{
		title: "Seguridad",
		body: "Protegemos tu información con cifrado en tránsito y en reposo, y seguimos las mejores prácticas de la industria para mantener tus datos seguros.",
	},
	{
		title: "Contacto",
		body: "Para cualquier duda sobre esta política, escríbenos a {contactEmail}. Actualizaremos esta página cuando haya cambios relevantes.",
	},
];

function PrivacyPage() {
	const contactEmail = useConfig(
		"privacy.contact_email",
		"privacidad@role.app",
	);
	const sections = SECTIONS.map((section) => ({
		...section,
		body: section.body.replace("{contactEmail}", contactEmail),
	}));
	const updatedRaw = useConfig("legal.privacy_updated_at", "");
	const updatedDate = updatedRaw
		? new Date(updatedRaw).toLocaleDateString("es-MX", {
				year: "numeric",
				month: "long",
				day: "numeric",
			})
		: undefined;

	return (
		<div className="min-h-screen">
			<Navbar />
			<main id="main" className="mx-auto max-w-3xl px-6 pb-32 pt-28">
				<p className="text-sm font-semibold uppercase tracking-widest text-role-primary reveal">
					Legal
				</p>
				<h1 className="mt-3 font-heading text-4xl font-bold tracking-tight reveal reveal-delay-1">
					Política de privacidad
				</h1>
				<p className="mt-4 text-sm text-role-muted-foreground reveal reveal-delay-2">
					Última actualización:{" "}
					{updatedDate ??
						new Date().toLocaleDateString("es-MX", {
							year: "numeric",
							month: "long",
							day: "numeric",
						})}
				</p>
				<div className="mt-12 space-y-10 border-l border-role-border pl-8">
					{sections.map((s, i) => (
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
