import { Eyebrow, Section } from "@/components/section";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";

export const FAQ_ITEMS = [
	{
		q: "¿Qué es Rolé?",
		a: "Rolé es la app para rescatar excedente de comida: los comercios publican lo que les sobró del día y las personas lo reservan gratis y lo recogen pagando directo en el comercio.",
	},
	{
		q: "¿Cuánto cuesta?",
		a: "Rolé para quien rescata no tiene suscripción. Los locales eligen un plan y una comisión por bolsa. Te armamos una propuesta, no un precio genérico.",
	},
	{
		q: "¿Dónde operan?",
		a: "El lanzamiento cubre Santo Domingo. Pronto estaremos cerca de ti en más ciudades.",
	},
	{
		q: "¿Cómo empiezo?",
		a: "Si eres un local, entra a Rolé y pide acceso, o déjanos tus datos y armamos un piloto de unas cuantas semanas.",
	},
];

export function Faq() {
	return (
		<Section id="preguntas" tone="cream">
			<div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
				<div className="reveal">
					<Eyebrow>Preguntas</Eyebrow>
					<h2 className="font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl">
						Antes de escribirnos.
					</h2>
				</div>
				<Accordion className="flex flex-col reveal reveal-delay-1">
					{FAQ_ITEMS.map((item, i) => (
						<AccordionItem
							key={item.q}
							value={item.q}
							className={`reveal reveal-delay-${i + 1}`}
						>
							<AccordionTrigger>{item.q}</AccordionTrigger>
							<AccordionContent>{item.a}</AccordionContent>
						</AccordionItem>
					))}
				</Accordion>
			</div>
		</Section>
	);
}
