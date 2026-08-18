const FEATURES = [
	{
		icon: "🥗",
		title: "Reduce el desperdicio",
		body: "Ayuda a restaurantes y comercios a reducir el desperdicio de alimentos mientras ahorras dinero.",
	},
	{
		icon: "💸",
		title: "Ahorra hasta 70%",
		body: "Obtén productos de calidad a precios increíbles. Paga menos de la mitad del precio original.",
	},
	{
		icon: "🌍",
		title: "Impacto positivo",
		body: "Cada compra que haces ayuda al planeta y apoya a los comercios locales de tu ciudad.",
	},
	{
		icon: "⚡",
		title: "Fácil y rápido",
		body: "Reserva en segundos, recoge cuando te convenga. Todo desde tu móvil.",
	},
];

export function Features() {
	return (
		<section className="mx-auto max-w-6xl px-6 py-24">
			<div className="mx-auto max-w-2xl text-center">
				<h2 className="font-heading text-3xl font-bold md:text-4xl">
					¿Por qué usar Rolé?
				</h2>
				<p className="mt-4 text-lg text-role-muted-foreground">
					Bueno para tu bolsillo, bueno para el planeta y bueno para tu
					comunidad.
				</p>
			</div>
			<div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
				{FEATURES.map((f) => (
					<div
						key={f.title}
						className="rounded-2xl border border-role-border bg-white p-6 transition-shadow hover:shadow-lg"
					>
						<div className="text-3xl">{f.icon}</div>
						<h3 className="mt-4 font-heading text-lg font-bold">{f.title}</h3>
						<p className="mt-2 text-sm leading-relaxed text-role-muted-foreground">
							{f.body}
						</p>
					</div>
				))}
			</div>
		</section>
	);
}
