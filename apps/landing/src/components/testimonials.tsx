const TESTIMONIALS = [
	{
		name: "María González",
		role: "Usuaria de Rolé",
		text: "Reservo el almuerzo de la semana en la panadería de la esquina. Pago $60 en vez de $150 y llego a tiempo para la última tanda.",
		initials: "MG",
	},
	{
		name: "Carlos Ruiz",
		role: "Panadería La Espiga",
		text: "Antes tiraba el pan de ayer. Ahora es el 12% de mis ingresos del día y la gente viene por la recogida puntual, que es lo que más valoro.",
		initials: "CR",
	},
	{
		name: "Laura Martín",
		role: "Usuaria de Rolé",
		text: "Descubrí tres restaurantes del barrio que no conocía. El sistema de reserva me dejó libre 40 minutos, justo los que necesito entre clases.",
		initials: "LM",
	},
	{
		name: "Javier Torres",
		role: "Café Central",
		text: "Rolé nos permitió dar salida a los croissants del día anterior. Ahora tenemos cola a las 19h y recuperamos el 15% de facturación.",
		initials: "JT",
	},
];

function StarIcon() {
	return (
		// biome-ignore lint/a11y/noSvgWithoutTitle: icono decorativo
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="#f59e0b"
			stroke="#f59e0b"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden
		>
			<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
		</svg>
	);
}

function Stars() {
	return (
		<div
			className="flex gap-0.5 text-sm text-role-star"
			role="img"
			aria-label="5 de 5 estrellas"
		>
			<StarIcon />
			<StarIcon />
			<StarIcon />
			<StarIcon />
			<StarIcon />
		</div>
	);
}

export function Testimonials() {
	return (
		<section className="mx-auto max-w-6xl px-6 pb-32 pt-24">
			<div className="max-w-2xl reveal">
				<p className="text-sm font-semibold uppercase tracking-widest text-role-primary">
					Quién usa Rolé
				</p>
				<h2 className="mt-3 font-heading text-3xl font-bold tracking-tight md:text-5xl">
					Lo que se comenta en las recogidas
				</h2>
				<p className="mt-4 max-w-md text-lg text-role-muted-foreground">
					Miles de personas rescatan comida todos los días. Algunas lo cuentan
					así.
				</p>
			</div>
			<div className="mt-14 grid gap-5 lg:grid-cols-12">
				{TESTIMONIALS.map((t, i) => {
					const spans = [
						{ col: "lg:col-span-6", row: "", rotate: "" },
						{
							col: "lg:col-span-6 lg:col-start-7",
							row: "lg:row-start-2 lg:row-end-4",
							rotate: "-rotate-1",
						},
						{ col: "lg:col-span-6", row: "lg:row-start-2", rotate: "rotate-1" },
						{
							col: "lg:col-span-6 lg:col-start-7",
							row: "lg:row-start-4",
							rotate: "-rotate-1",
						},
					];
					const s = spans[i];
					return (
						<figure
							key={t.name}
							className={`relative flex flex-col rounded-[var(--radius-card)] p-7 bg-white shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-raised ${s.col} ${s.row} ${s.rotate} reveal reveal-delay-${i + 1}`}
						>
							<Stars />
							<blockquote className="mt-4 flex-1 leading-relaxed text-role-foreground">
								“{t.text}”
							</blockquote>
							<figcaption className="mt-6 flex items-center gap-3">
								<span
									className="flex h-11 w-11 items-center justify-center rounded-xl font-heading text-sm font-bold bg-role-primary-soft text-role-primary"
									aria-hidden
								>
									{t.initials}
								</span>
								<div>
									<p className="text-sm font-semibold">{t.name}</p>
									<p className="text-xs text-role-muted-foreground">{t.role}</p>
								</div>
							</figcaption>
						</figure>
					);
				})}
			</div>
		</section>
	);
}
