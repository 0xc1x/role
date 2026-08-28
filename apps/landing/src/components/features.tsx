import { BadgePercent, Earth, Salad, Zap } from "lucide-react";

import { Eyebrow, Section } from "@/components/section";

const FEATURES = [
	{
		icon: Salad,
		title: "Reduce el desperdicio",
		body: "Ayuda a restaurantes y comercios a reducir el desperdicio de alimentos mientras ahorras dinero. Cada bolsa rescatada cuenta.",
	},
	{
		icon: BadgePercent,
		title: "Ahorra hasta 70%",
		body: "Obtén productos de calidad a precios increíbles. Paga menos de la mitad del precio original.",
	},
	{
		icon: Earth,
		title: "Impacto positivo",
		body: "Cada compra que haces ayuda al planeta y apoya a los comercios locales de tu ciudad.",
	},
	{
		icon: Zap,
		title: "Fácil y rápido",
		body: "Reserva en segundos, recoge cuando te convenga. Todo desde tu móvil.",
	},
];

export function Features() {
	return (
		<Section id="caracteristicas" tone="cream">
			<div className="max-w-2xl reveal">
				<Eyebrow>Por qué Rolé</Eyebrow>
				<h2 className="font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl md:text-5xl">
					Bueno para tu bolsillo, bueno para el planeta.
				</h2>
				<p className="mt-4 max-w-md text-base leading-relaxed text-ink-soft">
					Cuatro razones para no dejar que la comida buena se desperdicie.
				</p>
			</div>
			<div className="mt-14 grid gap-4 sm:grid-cols-2">
				{FEATURES.map((f, i) => (
					<article
						key={f.title}
						className={`rounded-3xl bg-paper p-6 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)] md:p-8 reveal reveal-delay-${i + 1}`}
					>
						<div className="flex size-11 items-center justify-center rounded-2xl bg-leaf text-forest">
							<f.icon className="size-5" strokeWidth={1.75} />
						</div>
						<h3 className="mt-5 font-display text-xl font-medium tracking-tight">
							{f.title}
						</h3>
						<p className="mt-2 text-sm leading-relaxed text-ink-soft">
							{f.body}
						</p>
					</article>
				))}
			</div>
		</Section>
	);
}
