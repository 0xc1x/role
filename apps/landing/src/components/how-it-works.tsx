import { Eyebrow, Section } from "@/components/section";
import { StepsGrid } from "@/components/steps-grid";

const STEPS = [
	{
		n: "01",
		title: "Los locales publican al cierre",
		body: "Un restaurante sube lo que le sobró del día: porciones, pan, fruta. En menos de un minuto está visible en el mapa.",
	},
	{
		n: "02",
		title: "Reservas gratis en la app",
		body: "Ves qué hay cerca, a cuánto y hasta cuándo. Reservas tu bolsa sorpresa gratis — sin filas ni llamadas. Pagas directo en el comercio al recoger.",
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
			<StepsGrid steps={STEPS} />
		</Section>
	);
}
