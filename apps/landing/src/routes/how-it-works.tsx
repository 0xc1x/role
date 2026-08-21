import { createFileRoute, Link } from "@tanstack/react-router";

import { Footer } from "@/components/footer";
import {
	ArrowRightIcon,
	ClockCheckIcon,
	LeafIcon,
	MapPinIcon,
	TagIcon,
} from "@/components/icons";
import { Navbar } from "@/components/navbar";

export const Route = createFileRoute("/how-it-works")({
	component: HowItWorksPage,
});

const STEPS = [
	{
		n: "01",
		title: "Descubre las ofertas",
		body: "Abre la app y explora un mapa de comercios cerca de ti con excedente de comida fresca. Cada oferta muestra el contenido aproximado, el horario de recogida y el descuento aplicado — desde 50% hasta 70% del precio original.",
		detail:
			"Filtra por tipo de comida, distancia y horario. Guarda tus comercios favoritos para recibir alertas cuando publiquen.",
	},
	{
		n: "02",
		title: "Reserva en segundos",
		body: "Elige la oferta que más te guste y confirma la reserva. Recibe al instante un código de recogida único directamente en la app, con la dirección del comercio y la ventana de tiempo para pasar.",
		detail:
			"La reserva es gratuita. El pago se hace en el comercio al recoger — sin tarjeta, sin compromiso previo.",
	},
	{
		n: "03",
		title: "Recoge y disfruta",
		body: "Acude al comercio dentro del horario indicado, muestra tu código en la app, paga y llévate tu comida. Sin filas, sin esperas, sin sorpresas.",
		detail:
			"La comida ya está lista para ti. Solo pasa, recoge y disfruta de comida de calidad a una fracción del precio.",
	},
];

const VALUE_PROPS = [
	{
		icon: TagIcon,
		title: "Ahorro real",
		body: "Paga entre 50% y 70% menos por comida de calidad que de otra forma se desperdiciaría.",
	},
	{
		icon: LeafIcon,
		title: "Impacto tangible",
		body: "Cada reserva evita que comida perfectamente buena termine en la basura. Mides tu impacto en la app.",
	},
	{
		icon: ClockCheckIcon,
		title: "Sin complicaciones",
		body: "Reservas en menos de 2 minutos y recoges en el horario que elige el comercio. Así de simple.",
	},
];

const FAQ = [
	{
		q: "¿Tengo que pagar antes de recoger?",
		a: "No. La reserva es gratis y confirma tu lugar. Pagas directamente en el comercio al momento de recoger tu comida.",
	},
	{
		q: "¿Qué pasa si no llego a tiempo?",
		a: "Tu reserva se libera automáticamente al terminar el horario de recogida para que otro usuario pueda aprovecharla. Puedes cancelar sin costo antes de que empiece.",
	},
	{
		q: "¿Qué contiene exactamente la comida?",
		a: "Cada oferta describe el contenido aproximado. Como se trata de excedente del día, los artículos exactos pueden variar según lo que el comercio tenga disponible, pero siempre corresponde a comida de calidad.",
	},
];

function HowItWorksPage() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main id="main">
				{/* Hero */}
				<section
					data-hero
					className="relative overflow-hidden bg-role-dark-bg px-6 pt-36 pb-24 text-white md:pt-44 md:pb-32"
				>
					<div aria-hidden className="pointer-events-none absolute inset-0">
						<div className="absolute inset-0 bg-gradient-to-br from-role-dark-bg via-role-dark-bg to-role-primary-deep/30" />
						<div className="absolute -top-32 right-0 h-96 w-96 animate-drift rounded-full bg-role-primary/20 blur-3xl" />
						<div className="absolute bottom-0 left-1/4 h-72 w-72 animate-drift-slow rounded-full bg-role-primary-deep/30 blur-3xl" />
						<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_40%,_rgb(26_22_20)_100%)]" />
					</div>
					<div className="relative mx-auto max-w-4xl">
						<p className="text-sm font-semibold uppercase tracking-widest text-role-secondary reveal">
							Guía rápida
						</p>
						<h1 className="mt-4 font-heading text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl reveal reveal-delay-1">
							¿Cómo funciona Rolé?
						</h1>
						<p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75 reveal reveal-delay-2">
							Salvar comida nunca fue tan fácil. Descubre, reserva y recoge en
							tres pasos. Todo desde tu móvil, sin papeles ni complicaciones.
						</p>
						<div className="mt-10 flex flex-wrap gap-4 reveal reveal-delay-3">
							<a
								href="role://"
								className="rounded-full bg-white px-7 py-3 font-semibold text-role-primary shadow-dark-glow transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl active:scale-[0.98]"
							>
								Descargar la app
							</a>
							<Link
								to="/for-business"
								className="rounded-full border border-white/25 px-7 py-3 font-semibold text-white transition-all duration-200 hover:bg-white/10 active:scale-[0.98]"
							>
								Soy negocio
							</Link>
						</div>
					</div>
				</section>

				{/* Steps */}
				<section className="mx-auto max-w-5xl px-6 py-24 md:py-32">
					<div className="mb-16 max-w-2xl reveal">
						<p className="text-sm font-semibold uppercase tracking-widest text-role-primary">
							El proceso
						</p>
						<h2 className="mt-3 font-heading text-3xl font-bold tracking-tight md:text-4xl">
							Tres pasos. Menos de dos minutos.
						</h2>
					</div>
					<div className="space-y-6">
						{STEPS.map((s, i) => {
							const Icon =
								[MapPinIcon, TagIcon, ClockCheckIcon][i] ?? ClockCheckIcon;
							return (
								<article
									key={s.n}
									className={`group relative flex flex-col gap-6 rounded-[var(--radius-card)] border border-role-border/50 bg-white p-8 shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:border-role-primary/30 hover:shadow-raised sm:flex-row sm:items-start md:p-10 reveal reveal-delay-${i + 1}`}
								>
									<div className="flex items-center gap-5 sm:flex-col sm:items-center sm:gap-3">
										<span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-role-primary-soft font-heading text-base font-bold text-role-primary tabular-nums">
											{s.n}
										</span>
										<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-role-muted text-role-foreground transition-colors duration-300 group-hover:bg-role-primary group-hover:text-white">
											<Icon className="h-5 w-5" />
										</div>
									</div>
									<div className="flex-1">
										<h3 className="font-heading text-xl font-bold tracking-tight md:text-2xl">
											{s.title}
										</h3>
										<p className="mt-3 max-w-xl leading-relaxed text-role-muted-foreground">
											{s.body}
										</p>
										<p className="mt-4 border-l-2 border-role-primary/20 pl-4 text-sm leading-relaxed text-role-foreground/70">
											{s.detail}
										</p>
									</div>
								</article>
							);
						})}
					</div>
				</section>

				{/* Value props */}
				<section className="bg-role-surface-muted px-6 py-24 md:py-32">
					<div className="mx-auto max-w-5xl">
						<div className="mb-16 max-w-2xl reveal">
							<p className="text-sm font-semibold uppercase tracking-widest text-role-primary">
								Por qué vale la pena
							</p>
							<h2 className="mt-3 font-heading text-3xl font-bold tracking-tight md:text-4xl">
								Bueno para tu bolsillo. Bueno para el planeta.
							</h2>
						</div>
						<div className="grid gap-5 md:grid-cols-3">
							{VALUE_PROPS.map((v, i) => {
								const Icon = v.icon;
								return (
									<article
										key={v.title}
										className={`rounded-[var(--radius-card)] bg-white p-8 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-raised reveal reveal-delay-${i + 1}`}
									>
										<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-role-primary-soft text-role-primary">
											<Icon className="h-6 w-6" />
										</div>
										<h3 className="mt-6 font-heading text-lg font-bold">
											{v.title}
										</h3>
										<p className="mt-3 text-sm leading-relaxed text-role-muted-foreground">
											{v.body}
										</p>
									</article>
								);
							})}
						</div>
					</div>
				</section>

				{/* Mini FAQ */}
				<section className="mx-auto max-w-3xl px-6 py-24 md:py-32">
					<div className="mb-12 reveal">
						<p className="text-sm font-semibold uppercase tracking-widest text-role-primary">
							Dudas frecuentes
						</p>
						<h2 className="mt-3 font-heading text-3xl font-bold tracking-tight md:text-4xl">
							Lo que más nos preguntan
						</h2>
					</div>
					<div className="space-y-3">
						{FAQ.map((f, i) => (
							<details
								key={f.q}
								className={`group overflow-hidden rounded-[var(--radius-card)] border border-role-border bg-white transition-all duration-300 hover:shadow-soft [&_summary::-webkit-details-marker]:hidden reveal reveal-delay-${i + 1}`}
							>
								<summary className="flex cursor-pointer select-none items-center justify-between gap-4 px-6 py-5">
									<span className="font-heading text-base font-bold text-role-foreground transition-colors group-hover:text-role-primary">
										{f.q}
									</span>
									<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-role-muted text-role-primary transition-transform duration-200 group-open:rotate-180">
										{/* biome-ignore lint/a11y/noSvgWithoutTitle: icono decorativo */}
										<svg
											width="16"
											height="16"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
											strokeLinecap="round"
											strokeLinejoin="round"
											aria-hidden
										>
											<path d="m6 9 6 6 6-6" />
										</svg>
									</span>
								</summary>
								<div className="px-6 pb-5 pt-0">
									<p className="max-w-2xl leading-relaxed text-role-muted-foreground">
										{f.a}
									</p>
								</div>
							</details>
						))}
					</div>
					<Link
						to="/help-center"
						className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-role-primary transition-colors hover:text-role-primary-hover reveal reveal-delay-4"
					>
						Ver todas las preguntas
						<ArrowRightIcon className="h-4 w-4" />
					</Link>
				</section>

				{/* CTA */}
				<section className="mx-auto max-w-6xl px-6 pb-32">
					<div className="relative overflow-hidden rounded-[var(--radius-section)] bg-role-primary px-8 py-20 text-center text-white md:px-16">
						<div aria-hidden className="pointer-events-none absolute inset-0">
							<div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
							<div className="absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-role-primary-deep/70 blur-3xl" />
						</div>
						<div className="relative reveal">
							<h2 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">
								Listo para tu primera reserva
							</h2>
							<p className="mx-auto mt-4 max-w-lg text-lg text-white/85">
								Descarga la app y empieza a rescatar comida deliciosa hoy mismo.
							</p>
							<a
								href="role://"
								className="mt-9 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3 font-semibold text-role-primary shadow-dark-glow transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl active:scale-[0.98]"
							>
								Conseguir la app
								<ArrowRightIcon className="h-4 w-4" />
							</a>
						</div>
					</div>
				</section>
			</main>
			<Footer />
		</div>
	);
}
