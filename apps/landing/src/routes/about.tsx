import { createFileRoute } from "@tanstack/react-router";

import { Footer } from "@/components/footer";
import { HeartIcon, LeafIcon, SparkIcon, UsersIcon } from "@/components/icons";
import { Navbar } from "@/components/navbar";
import { Eyebrow } from "@/components/section";
import { HeroBackground } from "@/components/hero-background";
import { platformStatsQueryOptions } from "@/lib/queries";
import { usePlatformStats } from "@/lib/use-config";

export const Route = createFileRoute("/about")({
	loader: ({ context }) =>
		context.queryClient
			.ensureQueryData(platformStatsQueryOptions)
			.catch(() => undefined),
	component: AboutPage,
});

const numberFormat = new Intl.NumberFormat("es-EC");

function formatStat(value: number | undefined): string {
	if (value === undefined) return "—";
	return `${numberFormat.format(value)}+`;
}

const VALUES = [
	{
		icon: LeafIcon,
		title: "Menos desperdicio",
		body: "Cada comida rescatada es una menos en la basura. Medimos y publicamos nuestro impacto colectivo porque lo que se mide, mejora.",
	},
	{
		icon: UsersIcon,
		title: "Comunidad primero",
		body: "Conectamos comercios locales con personas del barrio. No somos un marketplace anónimo: fomentamos relaciones que se repiten.",
	},
	{
		icon: HeartIcon,
		title: "Acceso real",
		body: "Comida de calidad no debería ser lujo. Hacemos que sea accesible para más personas mientras los comercios recuperan valor.",
	},
	{
		icon: SparkIcon,
		title: "Simple por diseño",
		body: "Sin papeles, sin suscripciones, sin pasos extra. Si una funcionalidad no reduce fricción, no la construimos.",
	},
];

function AboutPage() {
	const stats = usePlatformStats();
	const IMPACT = [
		{ value: formatStat(stats?.users), label: "usuarios activos" },
		{ value: formatStat(stats?.businesses), label: "comercios aliados" },
		{ value: formatStat(stats?.meals_saved), label: "comidas salvadas" },
	];

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
						<Eyebrow>Sobre nosotros</Eyebrow>
						<h1 className="font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl md:text-5xl">
							La comida deliciosa no debería{" "}
							<span className="font-display italic font-normal text-role-secondary">
								terminar en la basura.
							</span>
						</h1>
						<p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75 reveal reveal-delay-2">
							Cada año, toneladas de comida perfectamente buena se desperdicia
							en comercios que no logran venderla a tiempo. A nosotros no nos
							parece bien.
						</p>
					</div>
				</section>

				{/* Story */}
				<section className="mx-auto max-w-3xl px-6 py-24 md:py-32">
					<div className="space-y-16">
						<div className="reveal">
							<h2 className="font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl md:text-5xl">
								La idea
							</h2>
							<p className="mt-4 leading-relaxed text-role-muted-foreground">
								Rolé nació de una observación simple: comercios de barrio tiran
								comida buena al final del día y, a la vez, muchas personas
								buscan opciones accesibles para comer bien. Conectamos esos dos
								extremos. Los comercios recuperan valor de su excedente y los
								usuarios disfrutan comida de calidad con hasta 70% de descuento.
							</p>
						</div>

						<div className="reveal reveal-delay-1">
							<h2 className="font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl md:text-5xl">
								La misión
							</h2>
							<p className="mt-4 leading-relaxed text-role-muted-foreground">
								Reducir el desperdicio de alimentos mientras construimos
								comunidades más conscientes y solidarias. No buscamos reemplazar
								la compra regular: queremos que el excedente que ya existe
								llegue a alguien que lo disfrute. Cada bolsa rescatada es un
								pequeño triunfo contra el desperdicio.
							</p>
						</div>

						<div className="reveal reveal-delay-2">
							<h2 className="font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl md:text-5xl">
								Cómo funciona
							</h2>
							<p className="mt-4 leading-relaxed text-role-muted-foreground">
								No somos un delivery ni un intermediario de pago. Somos una
								plataforma que conecta comercios con excedente y personas que
								quieren aprovecharlo. La reserva es gratuita, el pago se hace
								directo en el comercio y la recogida es presencial. Simple,
								transparente y sin comisiones ocultas.
							</p>
						</div>
					</div>
				</section>

				{/* Impact stats */}
				<section className="bg-role-surface-muted px-6 py-24 md:py-32">
					<div className="mx-auto max-w-4xl">
						<div className="mb-12 max-w-2xl reveal">
							<Eyebrow>El impacto hasta hoy</Eyebrow>
							<h2 className="font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl md:text-5xl">
								Números que cuentan
							</h2>
						</div>
						<dl className="grid grid-cols-1 gap-6 sm:grid-cols-3">
							{IMPACT.map((i, idx) => (
								<div
									key={i.label}
									className={`rounded-[var(--radius-card)] bg-white p-8 shadow-soft reveal reveal-delay-${idx + 1}`}
								>
									<dd className="font-heading text-3xl font-bold tabular-nums text-role-primary md:text-4xl">
										{i.value}
									</dd>
									<dt className="mt-2 text-sm text-role-muted-foreground">
										{i.label}
									</dt>
								</div>
							))}
						</dl>
					</div>
				</section>

				{/* Values */}
				<section className="mx-auto max-w-4xl px-6 py-24 md:py-32">
					<div className="mb-16 max-w-2xl reveal">
						<Eyebrow>Lo que nos guía</Eyebrow>
						<h2 className="font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl md:text-5xl">
							Cuatro principios
						</h2>
					</div>
					<div className="grid gap-5 sm:grid-cols-2">
						{VALUES.map((v, i) => {
							const Icon = v.icon;
							return (
								<article
									key={v.title}
									className={`rounded-[var(--radius-card)] border border-role-border/50 bg-white p-8 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-raised reveal reveal-delay-${i + 1}`}
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
								Únete al rol
							</h2>
							<p className="mx-auto mt-4 max-w-lg text-lg text-white/85">
								Rescata comida deliciosa a precio increíble o registra tu
								negocio para recuperar valor de tu excedente.
							</p>
							<div className="mt-9 flex flex-wrap justify-center gap-4">
								<a
									href="role://"
									className="rounded-full bg-white px-8 py-3 font-semibold text-role-primary shadow-dark-glow transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl active:scale-[0.98]"
								>
									Consigue la app
								</a>
								<a
									href="/for-business"
									className="rounded-full border border-white/30 px-8 py-3 font-semibold text-white transition-colors duration-200 hover:bg-white/10"
								>
									Soy negocio
								</a>
							</div>
						</div>
					</div>
				</section>
			</main>
			<Footer />
		</div>
	);
}
