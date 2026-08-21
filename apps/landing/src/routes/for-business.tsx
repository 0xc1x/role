import { createFileRoute } from "@tanstack/react-router";

import { Footer } from "@/components/footer";
import {
	ChartIcon,
	ClockCheckIcon,
	HeartIcon,
	SparkIcon,
	StoreIcon,
	UsersIcon,
} from "@/components/icons";
import { Navbar } from "@/components/navbar";

export const Route = createFileRoute("/for-business")({
	component: ForBusinessPage,
});

const BENEFITS = [
	{
		icon: ChartIcon,
		title: "Recupera valor del excedente",
		body: "Convierte la comida que no venderías en ingresos extra. Cada bolsa publicada es dinero que recuperas en lugar de pérdida.",
	},
	{
		icon: UsersIcon,
		title: "Nuevos clientes en tu zona",
		body: "Personas que no te conocían descubren tu negocio a través de Rolé. Muchas vuelven a comprar a precio normal después de la primera visita.",
	},
	{
		icon: HeartIcon,
		title: "Compromiso con tu comunidad",
		body: "Reduce tu desperdicio de alimentos y muestra tu impacto ambiental. Cada vez más consumidores valoran comercios sostenibles.",
	},
	{
		icon: ClockCheckIcon,
		title: "Cero fricción operativa",
		body: "Publica tu excedente en menos de un minuto. Define horarios de recogida, gestiona reservas y revisa estadísticas desde un panel simple.",
	},
];

const STATS = [
	{ value: "12%", label: "ingresos extra en promedio" },
	{ value: "1 940+", label: "comercios ya con nosotros" },
	{ value: "<24h", label: "para empezar a vender" },
];

const PROCESS = [
	{
		n: "01",
		title: "Registra tu negocio",
		body: "Completa tu perfil desde la app: nombre, dirección, tipo de comida. La activación es manual tras verificación para garantizar confianza.",
	},
	{
		n: "02",
		title: "Publica tu excedente",
		body: "Cuando tengas comida que no vas a vender, publica una oferta con el contenido aproximado, el precio y el horario de recogida.",
	},
	{
		n: "03",
		title: "Recibe y cobra",
		body: "Los usuarios reservan y recogen en el horario que definiste. El pago es directo en el comercio — sin intermediarios, sin comisiones sobre el cobro.",
	},
];

function ForBusinessPage() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main id="main">
				{/* Hero */}
				<section data-hero className="relative overflow-hidden bg-role-dark-bg px-6 pt-36 pb-24 text-white md:pt-44 md:pb-32">
					<div aria-hidden className="pointer-events-none absolute inset-0">
						<div className="absolute inset-0 bg-gradient-to-br from-role-dark-bg via-role-dark-bg to-role-primary-deep/30" />
						<div className="absolute -top-40 -right-32 h-96 w-96 animate-drift rounded-full bg-role-primary/20 blur-3xl" />
						<div className="absolute -bottom-48 -left-24 h-[30rem] w-[30rem] animate-drift-slow rounded-full bg-role-primary-deep/35 blur-3xl" />
						<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_40%,_rgb(26_22_20)_100%)]" />
					</div>
					<div className="relative mx-auto max-w-6xl">
						<div className="max-w-2xl">
							<p className="text-sm font-semibold uppercase tracking-widest text-role-secondary reveal">
								Para negocios
							</p>
							<h1 className="mt-4 font-heading text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl reveal reveal-delay-1">
								Convierte tu excedente en{" "}
								<span className="editorial italic font-normal text-role-secondary">
									ingresos.
								</span>
							</h1>
							<p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75 reveal reveal-delay-2">
								Únete a los más de 1 940 comercios que ya reducen su desperdicio
								y recuperan valor con Rolé. Sin costos de registro, sin
								comisiones sobre el cobro.
							</p>
							<div className="mt-10 flex flex-wrap gap-4 reveal reveal-delay-3">
								<a
									href="role://business-signup"
									className="rounded-full bg-white px-7 py-3 font-semibold text-role-primary shadow-dark-glow transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl active:scale-[0.98]"
								>
									Registrar mi negocio
								</a>
								<a
									href="mailto:negocios@role.app"
									className="rounded-full border border-white/25 px-7 py-3 font-semibold text-white transition-all duration-200 hover:bg-white/10 active:scale-[0.98]"
								>
									Hablar con ventas
								</a>
							</div>
							<p className="mt-5 text-sm text-white/55 reveal reveal-delay-4">
								Un representante responde en menos de 24 horas.
							</p>
						</div>

						{/* Stats strip */}
						<dl className="mt-16 grid grid-cols-3 gap-4 border-t border-white/10 pt-10 reveal reveal-delay-5">
							{STATS.map((s) => (
								<div key={s.label}>
									<dd className="font-heading text-3xl font-bold tabular-nums text-role-primary md:text-4xl">
										{s.value}
									</dd>
									<dt className="mt-1 text-sm text-white/55">{s.label}</dt>
								</div>
							))}
						</dl>
					</div>
				</section>

				{/* Benefits */}
				<section className="mx-auto max-w-5xl px-6 py-24 md:py-32">
					<div className="mb-16 max-w-2xl reveal">
						<p className="text-sm font-semibold uppercase tracking-widest text-role-primary">
							Por qué unirte
						</p>
						<h2 className="mt-3 font-heading text-3xl font-bold tracking-tight md:text-4xl">
							Cuatro razones para estar en Rolé
						</h2>
					</div>
					<div className="grid gap-5 md:grid-cols-2">
						{BENEFITS.map((b, i) => {
							const Icon = b.icon;
							return (
								<article
									key={b.title}
									className={`group rounded-[var(--radius-card)] border border-role-border/50 bg-white p-8 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-role-primary/30 hover:shadow-raised reveal reveal-delay-${i + 1}`}
								>
									<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-role-primary-soft text-role-primary transition-colors duration-300 group-hover:bg-role-primary group-hover:text-white">
										<Icon className="h-6 w-6" />
									</div>
									<h3 className="mt-6 font-heading text-xl font-bold">
										{b.title}
									</h3>
									<p className="mt-3 text-sm leading-relaxed text-role-muted-foreground">
										{b.body}
									</p>
								</article>
							);
						})}
					</div>
				</section>

				{/* Process */}
				<section className="bg-role-surface-muted px-6 py-24 md:py-32">
					<div className="mx-auto max-w-5xl">
						<div className="mb-16 max-w-2xl reveal">
							<p className="text-sm font-semibold uppercase tracking-widest text-role-primary">
								Cómo empezar
							</p>
							<h2 className="mt-3 font-heading text-3xl font-bold tracking-tight md:text-4xl">
								Del registro a tu primera venta
							</h2>
							<p className="mt-4 max-w-lg text-lg text-role-muted-foreground">
								Tres pasos. Menos de 24 horas para estar activo y vendiendo.
							</p>
						</div>
						<div className="relative grid gap-8 md:grid-cols-3 md:gap-6">
							<div
								aria-hidden
								className="absolute left-0 right-0 top-7 hidden h-px bg-gradient-to-r from-role-primary/0 via-role-primary/30 to-role-primary/0 md:block"
							/>
							{PROCESS.map((s, i) => (
								<div
									key={s.n}
									className={`relative reveal reveal-delay-${i + 1}`}
								>
									<div className="flex h-14 w-14 items-center justify-center rounded-full bg-role-primary font-heading text-base font-bold text-white shadow-glow">
										{s.n}
									</div>
									<h3 className="mt-6 font-heading text-xl font-bold">
										{s.title}
									</h3>
									<p className="mt-3 leading-relaxed text-role-muted-foreground">
										{s.body}
									</p>
								</div>
							))}
						</div>
					</div>
				</section>

				{/* Testimonial highlight */}
				<section className="mx-auto max-w-4xl px-6 py-24 md:py-32">
					<figure className="rounded-[var(--radius-section)] bg-role-primary p-10 text-white shadow-dark-glow md:p-16 reveal">
						<div
							className="flex gap-1 text-role-secondary"
							role="img"
							aria-label="5 de 5 estrellas"
						>
							{Array.from({ length: 5 }).map((_, i) => (
								// biome-ignore lint/a11y/noSvgWithoutTitle: icono decorativo
								<svg
									key={`star-${i}`}
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="#f59e0b"
									stroke="#f59e0b"
									strokeWidth="2"
									aria-hidden
								>
									<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
								</svg>
							))}
						</div>
						<blockquote className="mt-6 font-heading text-2xl font-semibold leading-snug tracking-tight md:text-3xl">
							“Antes tiraba el pan del día. Ahora representa el 12% de mis
							ingresos y la gente llega puntual a recoger. Rolé es la mejor
							decisión que tomé este año.”
						</blockquote>
						<figcaption className="mt-8 flex items-center gap-4">
							<span
								className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 font-heading text-sm font-bold"
								aria-hidden
							>
								CR
							</span>
							<div>
								<p className="font-semibold">Carlos Ruiz</p>
								<p className="text-sm text-white/70">Panadería La Espiga</p>
							</div>
						</figcaption>
					</figure>
				</section>

				{/* CTA */}
				<section className="mx-auto max-w-6xl px-6 pb-32">
					<div className="relative overflow-hidden rounded-[var(--radius-section)] bg-role-surface-muted px-8 py-16 text-center md:px-16 md:py-20">
						<div
							aria-hidden
							className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-role-primary/10 blur-3xl"
						/>
						<div className="relative reveal">
							<SparkIcon className="mx-auto h-8 w-8 text-role-primary" />
							<h2 className="mt-6 font-heading text-3xl font-bold tracking-tight md:text-4xl">
								¿Listo para unirte?
							</h2>
							<p className="mx-auto mt-4 max-w-xl text-lg text-role-muted-foreground">
								El registro se completa en la app. Un representante verifica tu
								negocio en menos de 24 horas.
							</p>
							<div className="mt-9 flex flex-wrap justify-center gap-4">
								<a
									href="role://business-signup"
									className="inline-flex items-center gap-2 rounded-full bg-role-primary px-8 py-3 font-semibold text-white shadow-soft transition-all duration-200 hover:bg-role-primary-hover hover:shadow-glow active:scale-[0.98]"
								>
									<StoreIcon className="h-5 w-5" />
									Registrar mi negocio
								</a>
								<a
									href="mailto:negocios@role.app"
									className="rounded-full border border-role-border px-8 py-3 font-semibold text-role-foreground transition-colors duration-200 hover:bg-role-muted"
								>
									Contactar a ventas
								</a>
							</div>
							<p className="mt-5 text-sm text-role-muted-foreground">
								Sin costo de registro. Sin comisiones sobre el cobro.
							</p>
						</div>
					</div>
				</section>
			</main>
			<Footer />
		</div>
	);
}
