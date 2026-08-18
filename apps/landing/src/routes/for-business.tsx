import { createFileRoute } from "@tanstack/react-router";

import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";

export const Route = createFileRoute("/for-business")({
	component: ForBusinessPage,
});

const BENEFITS = [
	{
		icon: "💰",
		title: "Recupera valor",
		body: "Convierte tu excedente diario en ingresos extra en lugar de pérdida.",
	},
	{
		icon: "👥",
		title: "Nuevos clientes",
		body: "Conecta con personas que descubren tu negocio a través de Rolé.",
	},
	{
		icon: "🌱",
		title: "Compromiso real",
		body: "Reduce tu desperdicio de alimentos y presume tu impacto ante tu comunidad.",
	},
	{
		icon: "⚙️",
		title: "Cero fricción",
		body: "Panel simple para publicar tu excedente en segundos, con recogida programada.",
	},
];

function ForBusinessPage() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main className="mx-auto max-w-6xl px-6 py-20">
				<div className="mx-auto max-w-2xl text-center">
					<h1 className="font-heading text-4xl font-bold">
						Convierte tu excedente en ingresos
					</h1>
					<p className="mt-4 text-lg text-role-muted-foreground">
						Únete a los más de 2 000 comercios que ya reducen su desperdicio con
						Rolé.
					</p>
				</div>
				<div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
					{BENEFITS.map((b) => (
						<div
							key={b.title}
							className="rounded-2xl border border-role-border bg-white p-6"
						>
							<div className="text-3xl">{b.icon}</div>
							<h2 className="mt-4 font-heading text-lg font-bold">{b.title}</h2>
							<p className="mt-2 text-sm leading-relaxed text-role-muted-foreground">
								{b.body}
							</p>
						</div>
					))}
				</div>
				<div className="mx-auto mt-20 max-w-2xl rounded-2xl bg-role-primary p-10 text-center text-white">
					<h2 className="font-heading text-2xl font-bold md:text-3xl">
						¿Listo para unirte?
					</h2>
					<p className="mt-3 text-white/85">
						Únete a Rolé y empieza a reducir el desperdicio hoy mismo. El
						registro de negocio se completa en la app.
					</p>
					<div className="mt-8 flex flex-wrap justify-center gap-4">
						<a
							href="role://business-signup"
							className="rounded-full bg-white px-8 py-3 font-semibold text-role-primary transition-opacity hover:opacity-90"
						>
							Registrar mi negocio
						</a>
						<a
							href="mailto:negocios@role.app"
							className="rounded-full border-2 border-white/40 px-8 py-3 font-semibold text-white transition-colors hover:bg-white/10"
						>
							Contactar a ventas
						</a>
					</div>
				</div>
			</main>
			<Footer />
		</div>
	);
}
