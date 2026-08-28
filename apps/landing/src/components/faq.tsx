import { ChevronDown } from "lucide-react";

import { Eyebrow, Section } from "@/components/section";

const ITEMS = [
	{
		q: "¿Füdi es lo mismo que Rolé?",
		a: "No. Füdi es la compañía y la plataforma. Rolé es el primer producto: la app para usuarios y locales que rescatan excedente. Distro cubre distribución de corto radio y Lab, los modelos de demanda y merma.",
	},
	{
		q: "¿Cuánto cuesta?",
		a: "Rolé para quien rescata no tiene suscripción. Los locales eligen un plan y una comisión por bolsa. Te armamos una propuesta, no un precio genérico.",
	},
	{
		q: "¿Dónde operan?",
		a: "El lanzamiento cubre Santo Domingo. Pronto estaremos en más cerca de ti en más ciudades.",
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
				{/* ponytail: native <details> instead of @radix-ui/accordion — add radix when single-open animation needs JS control */}
				<div className="flex flex-col reveal reveal-delay-1">
					{ITEMS.map((item, i) => (
						<details
							key={item.q}
							className={`group border-b border-line [&_summary::-webkit-details-marker]:hidden reveal reveal-delay-${i + 1}`}
						>
							<summary className="flex w-full cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-base font-medium text-ink">
								{item.q}
								<ChevronDown className="size-4 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180" />
							</summary>
							<p className="pb-5 text-sm leading-relaxed text-ink-soft">
								{item.a}
							</p>
						</details>
					))}
				</div>
			</div>
		</Section>
	);
}
