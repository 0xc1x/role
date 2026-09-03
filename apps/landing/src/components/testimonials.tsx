import { Eyebrow, Section } from "@/components/section";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";

const STORIES = [
	{
		quote:
			"No queríamos otra app de descuentos. Queríamos dejar de tirar el almuerzo. En el piloto, lo que no se vendía a las tres se reservaba a las dos.",
		name: "Carolina M.",
		role: "Dueña, cocina de almuerzos · Quito",
		initials: "CM",
	},
	{
		quote:
			"Publicar el excedente de la panadería nos tomó menos que cerrar caja. El primer sábado se agotaron las ocho bolsas — y volvió gente nueva el lunes.",
		name: "Diego R.",
		role: "Panadería San Juan · Cuenca",
		initials: "DR",
	},
	{
		quote:
			"Para un grupo, el valor no es la bolsa: es ver merma por local, por día, en dólares. Eso no lo teníamos en el Excel.",
		name: "Mariana V.",
		role: "Operaciones, grupo de cafeterías · Guayaquil",
		initials: "MV",
	},
];

export function Testimonials() {
	return (
		<Section id="historias">
			<div className="max-w-2xl reveal">
				<Eyebrow>Historias</Eyebrow>
				<h2 className="font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl md:text-5xl">
					Quien opera, no quien opina.
				</h2>
			</div>
			<div className="mt-14 grid gap-4 lg:grid-cols-3">
				{STORIES.map((s, i) => (
					<Card
						key={s.name}
						className={`flex flex-col rounded-3xl border-0 bg-cream p-0 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)] reveal reveal-delay-${i + 1}`}
					>
						<CardContent className="flex flex-1 flex-col p-6 md:p-8">
							<blockquote className="flex-1 font-display text-xl italic font-light leading-snug tracking-tight text-ink">
								“{s.quote}”
							</blockquote>
							<figcaption className="mt-8 flex items-center gap-3">
								<Avatar className="size-11 rounded-full bg-leaf text-forest">
									<AvatarFallback className="bg-leaf font-display text-sm font-medium text-forest">
										{s.initials}
									</AvatarFallback>
								</Avatar>
								<span>
									<span className="block text-sm font-semibold">{s.name}</span>
									<span className="block text-xs text-muted">{s.role}</span>
								</span>
							</figcaption>
						</CardContent>
					</Card>
				))}
			</div>
			<p className="mt-6 text-xs text-muted reveal reveal-delay-4">
				Relatos de piloto. Los nombres de locales se anonimizan hasta el
				lanzamiento público.
			</p>
		</Section>
	);
}
