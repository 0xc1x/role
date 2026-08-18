import { createFileRoute } from "@tanstack/react-router";

import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";

export const Route = createFileRoute("/how-it-works")({
	component: HowItWorksPage,
});

const STEPS = [
	{
		n: "1",
		title: "Explora las ofertas",
		body: "Abre la app y descubre los comercios con excedente de comida cerca de ti. Cada oferta muestra el contenido aproximado, el horario de recogida y el descuento aplicado.",
	},
	{
		n: "2",
		title: "Reserva en segundos",
		body: "Elige tu oferta favorita, confirma la reserva y recibe un código de recogida único directamente en la app.",
	},
	{
		n: "3",
		title: "Paga en el comercio",
		body: "Acude al comercio dentro del horario de recogida. Muestra tu código, paga en el momento y llévate tu comida.",
	},
];

const VALUE_PROPS = [
	{
		icon: "💸",
		title: "Precios increíbles",
		body: "Ahorra entre 50% y 70% en comida de calidad que de otra forma se desperdiciaría.",
	},
	{
		icon: "🌍",
		title: "Impacto real",
		body: "Cada reserva evita que comida perfectamente buena termine en la basura.",
	},
	{
		icon: "⏱️",
		title: "Sin complicaciones",
		body: "Reservas en menos de 2 minutos y recoges cuando el comercio te lo indica.",
	},
];

function HowItWorksPage() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main className="mx-auto max-w-4xl px-6 py-20">
				<div className="text-center">
					<h1 className="font-heading text-4xl font-bold">
						¿Cómo funciona Rolé?
					</h1>
					<p className="mt-4 text-lg text-role-muted-foreground">
						Salvar comida nunca fue tan fácil. Solo necesitas tres pasos.
					</p>
				</div>
				<div className="mt-14 space-y-8">
					{STEPS.map((s) => (
						<div
							key={s.n}
							className="flex gap-6 rounded-2xl border border-role-border bg-white p-8"
						>
							<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-role-primary font-heading text-xl font-bold text-white">
								{s.n}
							</span>
							<div>
								<h2 className="font-heading text-xl font-bold">{s.title}</h2>
								<p className="mt-2 leading-relaxed text-role-muted-foreground">
									{s.body}
								</p>
							</div>
						</div>
					))}
				</div>
				<div className="mt-16 grid gap-6 md:grid-cols-3">
					{VALUE_PROPS.map((v) => (
						<div
							key={v.title}
							className="rounded-2xl bg-role-muted p-6 text-center"
						>
							<div className="text-3xl">{v.icon}</div>
							<h3 className="mt-3 font-heading font-bold">{v.title}</h3>
							<p className="mt-2 text-sm leading-relaxed text-role-muted-foreground">
								{v.body}
							</p>
						</div>
					))}
				</div>
			</main>
			<Footer />
		</div>
	);
}
