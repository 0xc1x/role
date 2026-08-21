import { BagIcon } from "@/components/icons";

export const STATS = [
	{ value: "48 200+", label: "usuarios rescatando" },
	{ value: "1 940+", label: "comercios aliados" },
	{ value: "112 600+", label: "comidas salvadas" },
];

export function Hero() {
	return (
		<section data-hero className="relative min-h-[92vh] flex items-center overflow-hidden bg-role-dark-bg text-white">
			{/* Background layers — atmospheric, warm-tinted */}
			<div aria-hidden className="pointer-events-none absolute inset-0">
				<div className="absolute inset-0 bg-[url('https://picsum.photos/seed/role-market/1920/1280')] bg-cover bg-center opacity-[0.12]" />
				<div className="absolute inset-0 bg-gradient-to-br from-role-dark-bg via-role-dark-bg/92 to-role-primary-deep/25" />
				<div className="absolute -top-40 -right-32 h-96 w-96 animate-drift rounded-full bg-role-primary/20 blur-3xl" />
				<div className="absolute -bottom-48 -left-24 h-[30rem] w-[30rem] animate-drift-slow rounded-full bg-role-primary-deep/35 blur-3xl" />
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_38%,_rgb(26_22_20)_100%)]" />
			</div>

			{/* Floating product card — like Floria's floating flora */}
			<div
				aria-hidden
				className="pointer-events-none absolute top-20 right-4 hidden h-[58vh] w-[38vw] max-w-md items-end justify-end opacity-0 lg:flex animate-float-in"
				style={{ animationDelay: "300ms" }}
			>
				<div className="relative aspect-[3/4] w-full max-w-sm animate-float-y">
					<div className="absolute inset-0 rounded-[2rem] bg-role-primary/10 blur-2xl" />
					<div className="relative rounded-[2rem] bg-white/[0.04] border border-white/10 p-6 backdrop-blur-xl shadow-dark-glow">
						<div className="flex items-center justify-between rounded-[1.25rem] bg-white/[0.06] p-5">
							<div className="flex items-center gap-4">
								<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-role-primary text-white">
									<BagIcon className="h-7 w-7" />
								</div>
								<div>
									<p className="font-heading font-semibold">Panadería La Espiga</p>
									<p className="text-sm text-role-dark-muted">
										Pan artesanal · Centro
									</p>
								</div>
							</div>
							<div className="text-right">
								<p className="text-sm line-through text-role-dark-muted">
									$120
								</p>
								<p className="font-heading text-xl font-bold text-role-primary tabular-nums">
									$36
								</p>
							</div>
						</div>
					</div>
					<div className="absolute -bottom-6 -left-8 -rotate-6 rounded-[1.25rem] bg-white p-4 text-role-foreground shadow-raised">
						<p className="text-xs font-semibold uppercase tracking-wide text-role-dark-muted">
							Reservada
						</p>
						<p className="mt-1 font-heading text-lg font-bold tabular-nums">
							Bolsa sorpresa · $52
						</p>
					</div>
				</div>
			</div>

			{/* Main content */}
			<div className="relative mx-auto max-w-6xl px-6 py-24 lg:py-32 z-10">
				<div className="max-w-2xl space-y-8">
					{/* Badge */}
					<p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-1.5 text-sm font-medium backdrop-blur reveal">
						<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-role-secondary" />
						Rescata comida deliciosa a precio increíble
					</p>

					{/* Display headline with editorial serif span */}
					<h1 className="font-heading text-5xl font-extrabold leading-[0.98] tracking-[-0.02em] sm:text-6xl lg:text-7xl xl:text-[5.5rem] reveal reveal-delay-1">
						Comida deliciosa.{" "}
						<span className="editorial italic font-normal text-role-secondary">
							Mitad de precio.
						</span>
						<br />
						Cero desperdicio.
					</h1>

					{/* Subheadline */}
					<p className="max-w-lg text-lg leading-relaxed text-white/80 reveal reveal-delay-2">
						Rolé conecta comercios locales con excedente de comida con
						personas que quieren comer bien por menos. Menos desperdicio, más
						comunidad.
					</p>

					{/* CTAs */}
					<div className="flex flex-wrap items-center gap-4 reveal reveal-delay-3">
						<a
							href="role://"
							className="rounded-full bg-white px-7 py-3 font-semibold text-role-primary shadow-dark-glow transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl active:scale-[0.98] active:translate-y-0"
						>
							Descargar la app
						</a>
						<a
							href="/for-business"
							className="rounded-full border border-white/25 px-7 py-3 font-semibold text-white transition-all duration-200 hover:bg-white/10 active:scale-[0.98]"
						>
							Para negocios
						</a>
					</div>

					{/* Stats with tabular nums */}
					<dl className="flex divide-x divide-white/10 reveal reveal-delay-4">
						{STATS.map((s) => (
							<div key={s.label} className="px-5 first:pl-0 last:pr-0">
								<dt className="sr-only">{s.label}</dt>
								<dd className="font-heading text-2xl font-bold tabular-nums md:text-3xl">
									{s.value}
								</dd>
								<p className="mt-1 text-sm text-white/55">{s.label}</p>
							</div>
						))}
					</dl>
				</div>
			</div>

			{/* Scroll indicator */}
			<div
				className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce reveal reveal-delay-6"
				aria-hidden
			>
				{/* biome-ignore lint/a11y/noSvgWithoutTitle: icono decorativo */}
				<svg
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="text-white/40"
				>
					<path d="M12 5v14M19 12l-7 7-7-7" />
				</svg>
			</div>
		</section>
	);
}
