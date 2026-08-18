const STEPS = [
	{
		n: "1",
		title: "Explora",
		body: "Descubre ofertas de comida cerca de ti a precios reducidos.",
	},
	{
		n: "2",
		title: "Reserva",
		body: "Reserva en segundos y recibe tu código de recogida.",
	},
	{
		n: "3",
		title: "Recoge",
		body: "Pasa por el comercio y recupera tu comida. ¡Listo!",
	},
];

export function HowItWorks() {
	return (
		<section className="bg-role-muted py-24">
			<div className="mx-auto max-w-6xl px-6">
				<div className="mx-auto max-w-2xl text-center">
					<h2 className="font-heading text-3xl font-bold md:text-4xl">
						Así de fácil funciona
					</h2>
					<p className="mt-4 text-lg text-role-muted-foreground">
						Del excedente del comercio a tu mesa en tres pasos.
					</p>
				</div>
				<div className="mt-14 grid gap-8 md:grid-cols-3">
					{STEPS.map((s) => (
						<div
							key={s.n}
							className="rounded-2xl border border-role-border bg-role-background p-8 text-center"
						>
							<div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-role-primary font-heading text-xl font-bold text-white">
								{s.n}
							</div>
							<h3 className="mt-5 font-heading text-xl font-bold">{s.title}</h3>
							<p className="mt-2 leading-relaxed text-role-muted-foreground">
								{s.body}
							</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
