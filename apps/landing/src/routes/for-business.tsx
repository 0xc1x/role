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
import { usePlatformStats } from "@/lib/use-config";
import { Eyebrow } from "@/components/section";
import { Cta } from "@/components/cta";
import { HeroBackground } from "@/components/hero-background";

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

const numberFormat = new Intl.NumberFormat("es-EC");

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
	const statsData = usePlatformStats();
	const stats = [
		{ value: "12%", label: "ingresos extra en promedio" },
		{
			value:
				statsData === undefined
					? "—"
					: `${numberFormat.format(statsData.businesses)}+`,
			label: "comercios ya con nosotros",
		},
		{ value: "<24h", label: "para empezar a vender" },
	];
	const businessesLabel =
		stats[1].value === "—" ? undefined : stats[1].value.replace(/\+$/, "");
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
					<div className="relative mx-auto max-w-6xl">
						<div className="max-w-2xl">
							<p className="text-sm font-semibold uppercase tracking-widest text-role-secondary reveal">
								Para negocios
							</p>
							<h1 className="mt-4 font-heading text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl reveal reveal-delay-1">
								{"Convierte tu excedente en "}
								<span className="editorial italic font-normal text-role-secondary">
									ingresos.
								</span>
							</h1>
							<p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75 reveal reveal-delay-2">
								Únete a los más de {businessesLabel ?? "miles de"} comercios que
								ya reducen su desperdicio y recuperan valor con Rolé. Sin costos
								de registro, sin comisiones sobre el cobro.
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
							{(stats ?? []).map((s) => (
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
						<Eyebrow>Por qué unirte</Eyebrow>
						<h2 className="font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl md:text-5xl">
							Cuatro razones para estar en Rolé
						</h2>
					</div>
					<div className="grid gap-5 md:grid-cols-2">
						{BENEFITS.map((f, i) => (
							<article
								key={f.title}
								className={`rounded-3xl bg-paper p-6 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)] md:p-8 reveal reveal-delay-${i + 1}`}
							>
								<div className="flex size-11 items-center justify-center rounded-2xl bg-leaf text-forest">
									<f.icon className="size-5" strokeWidth={1.75} />
								</div>
								<h3 className="mt-5 font-display text-xl font-medium tracking-tight">
									{f.title}
								</h3>
								<p className="mt-2 text-sm leading-relaxed text-ink-soft">
									{f.body}
								</p>
							</article>
						))}
					</div>
				</section>

				{/* Process */}
				<section className="bg-role-surface-muted px-6 py-24 md:py-32">
					<div className="mx-auto max-w-5xl">
						<div className="mb-16 max-w-2xl reveal">
							<Eyebrow>Cómo empezar</Eyebrow>
							<h2 className="font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl md:text-5xl">
								Del registro a tu primera venta
							</h2>
							<p className="mt-4 max-w-lg text-lg text-role-muted-foreground">
								Tres pasos. Menos de 24 horas para estar activo y vendiendo.
							</p>
						</div>
						<ol className="mt-14 grid gap-6 md:grid-cols-3">
							{PROCESS.map((s, i) => (
								<li
									key={s.n}
									className={`relative reveal reveal-delay-${i + 1}`}
								>
									{i < PROCESS.length - 1 ? (
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

				{/* Testimonial highlight — visual unify: cream/leaf system like Testimonials */}
				<section className="mx-auto max-w-4xl px-6 py-24 md:py-32">
					<figure className="flex flex-col rounded-3xl bg-cream p-8 shadow-[var(--shadow-card)] md:p-10 reveal">
						<div
							className="flex gap-1"
							role="img"
							aria-label="5 de 5 estrellas"
						>
							{[1, 2, 3, 4, 5].map((n) => (
								// biome-ignore lint/a11y/noSvgWithoutTitle: icono decorativo
								<svg
									key={n}
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="#FACC15"
									stroke="#FACC15"
									strokeWidth="2"
									aria-hidden
								>
									<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
								</svg>
							))}
						</div>
						<blockquote className="mt-6 flex-1 font-display text-xl font-medium leading-snug tracking-tight text-ink md:text-2xl">
							“Antes tiraba el pan del día. Ahora representa el 12% de mis
							ingresos y la gente llega puntual a recoger. Rolé es la mejor
							decisión que tomé este año.”
						</blockquote>
						<figcaption className="mt-8 flex items-center gap-3">
							<span
								className="flex size-11 items-center justify-center rounded-full bg-leaf font-display text-sm font-medium text-forest"
								aria-hidden="true"
							>
								CR
							</span>
							<span>
								<span className="block text-sm font-semibold">Carlos Ruiz</span>
								<span className="block text-xs text-muted">
									Panadería La Espiga
								</span>
							</span>
						</figcaption>
					</figure>
				</section>

				<Cta
					variant="muted"
					title="¿Listo para unirte?"
					body="El registro se completa en la app. Un representante verifica tu negocio en menos de 24 horas."
					primaryLabel="Registrar mi negocio"
					primaryHref="role://business-signup"
					primaryIcon={<StoreIcon className="h-5 w-5" />}
					secondaryLabel="Contactar a ventas"
					secondaryHref="mailto:negocios@role.app"
					foot="Sin costo de registro. Sin comisiones sobre el cobro."
					icon={<SparkIcon className="h-8 w-8 text-role-primary" />}
				/>
			</main>
			<Footer />
		</div>
	);
}
