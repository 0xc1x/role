import { Eyebrow, Section } from "@/components/section";

const STEPS = [
	{
		n: "01",
		title: "Los locales publican al cierre",
		body: "Un restaurante sube lo que le sobró del día: porciones, pan, fruta. En menos de un minuto está visible en el mapa.",
	},
	{
		n: "02",
		title: "Reservas y pagas en la app",
		body: "Ves qué hay cerca, a cuánto y hasta cuándo. Reservas tu bolsa sorpresa y pagas desde Rolé — sin filas ni llamadas.",
	},
	{
		n: "03",
		title: "Recoges el mismo día",
		body: "Pasas por el local en la ventana acordada, muestras tu código y listo. Comida fresca a un tercio del precio.",
	},
];

export function HowItWorks() {
	return (
		<Section id="como-funciona">
			<div className="reveal">
				<Eyebrow>Cómo funciona</Eyebrow>
				<h2 className="max-w-2xl font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl md:text-5xl">
					Del excedente del comercio a tu mesa
				</h2>
			</div>
			<ol className="mt-14 grid gap-6 md:grid-cols-3">
				{STEPS.map((s, i) => (
					<li key={s.n} className={`relative reveal reveal-delay-${i + 1}`}>
						{i < STEPS.length - 1 ? (
							<span
								className="pointer-events-none absolute left-[4.5rem] right-[-0.75rem] top-6 hidden h-px bg-line md:block"
								aria-hidden="true"
							/>
						) : null}
						<p className="font-display text-4xl font-medium text-forest/30">
							{s.n}
						</p>
						<h3 className="mt-4 font-display text-xl font-medium tracking-tight">
							{s.title}
						</h3>
						<p className="mt-2 text-sm leading-relaxed text-ink-soft">
							{s.body}
						</p>
					</li>
				))}
			</ol>
		</Section>
	);
}
