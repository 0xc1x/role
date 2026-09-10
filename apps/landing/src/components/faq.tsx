import { Eyebrow, Section } from "@/components/section";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { FAQ_ITEMS } from "@/lib/faq";

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
