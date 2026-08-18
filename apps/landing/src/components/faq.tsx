const FAQS = [
	{
		q: "¿Qué es Rolé?",
		a: "Rolé es una plataforma que conecta comercios con excedente de comida con personas que quieren ahorrar dinero mientras ayudan al planeta. Los comercios ofrecen excedentes del día a precios reducidos.",
	},
	{
		q: "¿Cómo funciona el sistema de reservas?",
		a: "Explora los comercios disponibles cerca de ti, selecciona la oferta que quieras, confirma en la app y recoge tu pedido en el horario indicado. Todo el proceso toma menos de 2 minutos.",
	},
	{
		q: "¿Cuánto puedo ahorrar?",
		a: "Normalmente ahorrarás entre un 50% y 70% del precio original. Cada oferta muestra su descuento antes de reservar.",
	},
	{
		q: "¿En qué ciudades está disponible Rolé?",
		a: "Estamos expandiéndonos constantemente. Consulta la app para ver los comercios disponibles cerca de ti.",
	},
	{
		q: "¿Cómo me registro como comercio?",
		a: "Registra tu comercio desde la sección “Para negocios” o desde la propia app. Te guiaremos en todo el proceso de configuración.",
	},
];

export function Faq() {
	return (
		<section className="mx-auto max-w-3xl px-6 py-24">
			<div className="text-center">
				<h2 className="font-heading text-3xl font-bold md:text-4xl">
					Preguntas frecuentes
				</h2>
				<p className="mt-4 text-lg text-role-muted-foreground">
					Todo lo que necesitas saber sobre Rolé
				</p>
			</div>
			<div className="mt-12 space-y-4">
				{FAQS.map((f) => (
					<details
						key={f.q}
						className="rounded-2xl border border-role-border bg-white px-6 py-5 [&_summary::-webkit-details-marker]:hidden"
					>
						<summary className="cursor-pointer select-none font-heading text-base font-bold">
							{f.q}
						</summary>
						<p className="mt-3 leading-relaxed text-role-muted-foreground">
							{f.a}
						</p>
					</details>
				))}
			</div>
		</section>
	);
}
