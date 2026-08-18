import { createFileRoute } from "@tanstack/react-router";

import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";

export const Route = createFileRoute("/privacy")({
	component: PrivacyPage,
});

const SECTIONS = [
	{
		title: "1. Información que recopilamos",
		body: "Recopilamos la información que nos proporcionas al crear tu cuenta (nombre, correo, ubicación aproximada) y la información de uso de la app (ofertas vistas, reservas realizadas) para mejorar el servicio.",
	},
	{
		title: "2. Uso de la información",
		body: "Usamos tus datos para procesar reservas, coordinar recogidas, mostrarte ofertas relevantes cerca de ti y enviarte notificaciones sobre tus pedidos. Nunca vendemos tu información personal.",
	},
	{
		title: "3. Compartir con terceros",
		body: "Compartimos únicamente los datos necesarios con los comercios para completar tu reserva y con nuestros proveedores de infraestructura (almacenamiento, notificaciones, pagos).",
	},
	{
		title: "4. Tus derechos",
		body: "Puedes acceder, corregir o eliminar tus datos personales en cualquier momento desde la app o contactándonos. Puedes desactivar las notificaciones cuando quieras.",
	},
	{
		title: "5. Seguridad",
		body: "Protegemos tu información con cifrado en tránsito y en reposo, y seguimos las mejores prácticas de la industria para mantener tus datos seguros.",
	},
	{
		title: "6. Contacto",
		body: "Para cualquier duda sobre esta política, escríbenos a privacidad@role.app. Actualizaremos esta página cuando haya cambios relevantes.",
	},
];

function PrivacyPage() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main className="mx-auto max-w-3xl px-6 py-20">
				<h1 className="font-heading text-4xl font-bold">
					Política de privacidad
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
