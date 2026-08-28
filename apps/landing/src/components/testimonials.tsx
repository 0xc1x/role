import { Eyebrow, Section } from "@/components/section";

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
					<figure
						key={s.name}
						className={`flex flex-col rounded-3xl bg-cream p-6 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)] md:p-8 reveal reveal-delay-${i + 1}`}
					>
						<blockquote className="flex-1 font-display text-xl italic font-light leading-snug tracking-tight text-ink">
							“{s.quote}”
						</blockquote>
						<figcaption className="mt-8 flex items-center gap-3">
							<span
								className="flex size-11 items-center justify-center rounded-full bg-leaf font-display text-sm font-medium text-forest"
								aria-hidden="true"
							>
								{s.initials}
							</span>
							<span>
								<span className="block text-sm font-semibold">{s.name}</span>
								<span className="block text-xs text-muted">{s.role}</span>
							</span>
						</figcaption>
					</figure>
				))}
			</div>
			<p className="mt-6 text-xs text-muted reveal reveal-delay-4">
				Relatos de piloto. Los nombres de locales se anonimizan hasta el
				lanzamiento público.
			</p>
		</Section>
	);
}
