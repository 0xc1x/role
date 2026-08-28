import { createFileRoute, Link } from "@tanstack/react-router";

import { Footer } from "@/components/footer";
import {
	ArrowRightIcon,
	ClockCheckIcon,
	LeafIcon,
	TagIcon,
} from "@/components/icons";
import { Navbar } from "@/components/navbar";
import { ChevronDown } from "lucide-react";
import { Eyebrow } from "@/components/section";
import { Cta } from "@/components/cta";
import { HeroBackground } from "@/components/hero-background";

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
					<HeroBackground />
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
								Consigue la app
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
						<Eyebrow>El proceso</Eyebrow>
						<h2 className="max-w-2xl font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl md:text-5xl">
							Tres pasos. Menos de dos minutos.
						</h2>
					</div>
					<div className="space-y-6">
						<ol className="mt-14 grid gap-6 md:grid-cols-1">
							{STEPS.map((s, i) => (
								<li
									key={s.n}
									className={`relative reveal reveal-delay-${i + 1}`}
								>
									{i < STEPS.length - 1 ? (
										<span
											className="pointer-events-none absolute left-[4.5rem] right-[-0.75rem] top-6 hidden h-px bg-line md:block"
											aria-hidden="true"
										/>
									) : null}
									<p className="font-display text-4xl font-medium text-forest/30">
										{s.n}
									</p>
									<h3 className="mt-4 font-display text-xl font-medium tracking-tight">
										{s.title}
									</h3>
									<p className="mt-2 text-sm leading-relaxed text-ink-soft">
										{s.body}
									</p>
								</li>
							))}
						</ol>
					</div>
				</section>

				{/* Value props */}
				<section className="bg-role-surface-muted px-6 py-24 md:py-32">
					<div className="mx-auto max-w-5xl">
						<div className="mb-16 max-w-2xl reveal">
							<Eyebrow>Por qué vale la pena</Eyebrow>
							<h2 className="max-w-2xl font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl md:text-5xl">
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
						<Eyebrow>Dudas frecuentes</Eyebrow>
						<h2 className="font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl">
							Lo que más nos preguntan
						</h2>
					</div>
					<div className="space-y-3">
						{FAQ.map((item, i) => (
							<details
								key={item.q}
								className={`group border-b border-line [&_summary::-webkit-details-marker]:hidden reveal reveal-delay-${i + 1}`}
							>
								<summary className="flex w-full cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-base font-medium text-ink">
									{item.q}
									<ChevronDown className="size-4 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180" />
								</summary>
								<p className="pb-5 text-sm leading-relaxed text-ink-soft">
									{item.a}
								</p>
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

				<Cta
					eyebrow={undefined}
					title="Listo para tu primera reserva"
					body="Descarga la app y empieza a rescatar comida deliciosa hoy mismo."
					primaryLabel="Consigue la app"
					secondaryLabel={undefined}
					secondaryHref={undefined}
					foot={undefined}
				/>
			</main>
			<Footer />
		</div >
	);
}
