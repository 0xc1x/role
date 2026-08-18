const TESTIMONIALS = [
	{
		name: "María González",
		role: "Usuaria de Rolé",
		text: "¡Increíble! Ahorro dinero en comida de calidad y además ayudo al medio ambiente. Lo uso todos los días.",
		avatar:
			"https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop",
	},
	{
		name: "Carlos Ruiz",
		role: "Propietario de panadería",
		text: "Rolé me ha permitido reducir el desperdicio y conectar con nuevos clientes. Una solución brillante.",
		avatar:
			"https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop",
	},
	{
		name: "Laura Martín",
		role: "Usuaria de Rolé",
		text: "La mejor app para descubrir restaurantes locales y ahorrar. ¡Me encanta la variedad de opciones!",
		avatar:
			"https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop",
	},
];

const STAR_ICONS = ["★", "★", "★", "★", "★"]; // 5 de 5 estrellas

function Stars() {
	return (
		<div
			className="flex gap-1 text-role-star"
			role="img"
			aria-label="5 de 5 estrellas"
		>
			{STAR_ICONS.map((s) => (
				<span key={s}>{s}</span>
			))}
		</div>
	);
}

export function Testimonials() {
	return (
		<section className="mx-auto max-w-6xl px-6 py-24">
			<div className="mx-auto max-w-2xl text-center">
				<h2 className="font-heading text-3xl font-bold md:text-4xl">
					Lo que dicen nuestros usuarios
				</h2>
				<p className="mt-4 text-lg text-role-muted-foreground">
					Miles de personas ya rescatan comida todos los días.
				</p>
			</div>
			<div className="mt-14 grid gap-6 md:grid-cols-3">
				{TESTIMONIALS.map((t) => (
					<figure
						key={t.name}
						className="rounded-2xl border border-role-border bg-white p-6"
					>
						<Stars />
						<blockquote className="mt-4 leading-relaxed text-role-foreground">
							“{t.text}”
						</blockquote>
						<figcaption className="mt-6 flex items-center gap-3">
							<img
								src={t.avatar}
								alt={t.name}
								className="h-11 w-11 rounded-full object-cover"
								loading="lazy"
							/>
							<div>
								<p className="font-semibold">{t.name}</p>
								<p className="text-sm text-role-muted-foreground">{t.role}</p>
							</div>
						</figcaption>
					</figure>
				))}
			</div>
		</section>
	);
}
