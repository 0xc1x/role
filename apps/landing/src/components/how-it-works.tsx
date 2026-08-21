const STEPS = [
	{
		n: "01",
		title: "Explora",
		body: "Descubre ofertas de comida cerca de ti a precios reducidos.",
	},
	{
		n: "02",
		title: "Reserva",
		body: "Reserva en segundos y recibe tu código de recogida.",
	},
	{
		n: "03",
		title: "Recoge",
		body: "Pasa por el comercio y recupera tu comida. Sin filas ni esperas.",
	},
];

export function HowItWorks() {
	return (
		<section className="bg-role-muted py-32">
			<div className="mx-auto max-w-6xl px-6">
				<div className="flex flex-wrap items-end justify-between gap-6">
					<div>
						<p className="text-sm font-semibold uppercase tracking-widest text-role-primary">
							Así de fácil
						</p>
						<h2 className="mt-3 font-heading text-3xl font-bold tracking-tight md:text-5xl">
							Del excedente del comercio a tu mesa
						</h2>
					</div>
					<p className="text-sm font-heading font-bold text-role-muted-foreground">
						3 pasos · menos de 2 minutos
					</p>
				</div>
				<div className="relative mt-20 grid gap-12 md:grid-cols-3 md:gap-8">
					<div
						aria-hidden
						className="absolute left-0 right-0 top-7 hidden h-px bg-gradient-to-r from-role-primary/0 via-role-primary/40 to-role-primary/0 md:block"
					/>
					{STEPS.map((s, i) => (
						<div
							key={s.n}
							className={`relative ${i % 2 === 1 ? "md:mt-12" : ""}`}
						>
							<div className="flex h-14 w-14 items-center justify-center rounded-full bg-role-primary font-heading text-base font-bold text-white shadow-glow">
								{s.n}
							</div>
							<h3 className="mt-6 font-heading text-2xl font-bold">
								{s.title}
							</h3>
							<p className="mt-2 max-w-xs leading-relaxed text-role-muted-foreground">
								{s.body}
							</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
