import { BadgePercent, Earth, Salad, Zap } from "lucide-react";

export function Features() {
	return (
		<section className="mx-auto max-w-6xl px-6 pb-32 pt-24">
			<div className="max-w-2xl reveal">
				<p className="text-sm font-semibold uppercase tracking-widest text-role-primary">
					Por qué Rolé
				</p>
				<h2 className="mt-3 font-heading text-3xl font-bold tracking-tight md:text-5xl">
					Bueno para tu bolsillo, bueno para el planeta.
				</h2>
				<p className="mt-4 max-w-md font-heading text-lg text-role-muted-foreground">
					Cuatro razones para no dejar que la comida buena se desperdicie.
				</p>
			</div>
			<div className="mt-14 grid gap-5 lg:grid-cols-12 reveal reveal-delay-1">
				{/* Featured card - spans 7 columns, 2 rows */}
				<article className="relative group overflow-hidden rounded-[var(--radius-section)] p-8 lg:col-span-7 lg:row-span-2 bg-role-primary text-white shadow-dark-glow reveal reveal-delay-2">
					<div
						aria-hidden
						className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl opacity-60 transition-opacity duration-300 group-hover:opacity-100"
					/>
					<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 text-role-primary-foreground">
						<Salad className="h-6 w-6" />
					</div>
					<h3 className="mt-6 font-heading text-2xl font-bold md:text-3xl">
						Reduce el desperdicio
					</h3>
					<p className="mt-3 max-w-xl text-base leading-relaxed text-white/80">
						Ayuda a restaurantes y comercios a reducir el desperdicio de
						alimentos mientras ahorras dinero. Cada bolsa rescatada cuenta.
					</p>
					<div className="mt-8 flex items-center gap-4 text-sm font-medium text-white/70">
						<span className="flex items-center gap-1.5">
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
								<path d="M12 5v14M19 12l-7 7-7-7" />
							</svg>
							Ver cómo funciona
						</span>
						<span className="flex items-center gap-1.5">
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
								<path d="M18 6 6 18M6 6l12 12" />
							</svg>
							Para negocios
						</span>
					</div>
				</article>

				{/* Regular cards - 5 columns each */}
				<article
					key="ahorro"
					className="group overflow-hidden rounded-[var(--radius-card)] p-7 bg-white shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-raised lg:col-span-5 lg:col-start-8 reveal reveal-delay-3"
				>
					<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-role-primary-soft text-role-primary">
						<BadgePercent className="h-6 w-6" />
					</div>
					<h3 className="mt-6 font-heading text-xl font-bold">
						Ahorra hasta 70%
					</h3>
					<p className="mt-2 text-sm leading-relaxed text-role-muted-foreground">
						Obtén productos de calidad a precios increíbles. Paga menos de la
						mitad del precio original.
					</p>
				</article>

				<article
					key="impacto"
					className="group overflow-hidden rounded-[var(--radius-card)] p-7 bg-white shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-raised lg:col-span-5 lg:col-start-8 reveal reveal-delay-4"
				>
					<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-role-primary-soft text-role-primary">
						<Earth className="h-6 w-6" />
					</div>
					<h3 className="mt-6 font-heading text-xl font-bold">
						Impacto positivo
					</h3>
					<p className="mt-2 text-sm leading-relaxed text-role-muted-foreground">
						Cada compra que haces ayuda al planeta y apoya a los comercios
						locales de tu ciudad.
					</p>
				</article>

				<article
					key="facil"
					className="group overflow-hidden rounded-[var(--radius-card)] p-7 bg-white shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-raised lg:col-span-5 lg:col-start-1 lg:row-start-3 reveal reveal-delay-5"
				>
					<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-role-primary text-white">
						<Zap className="h-6 w-6" />
					</div>
					<h3 className="mt-6 font-heading text-xl font-bold">
						Fácil y rápido
					</h3>
					<p className="mt-2 text-sm leading-relaxed text-role-muted-foreground">
						Reserva en segundos, recoge cuando te convenga. Todo desde tu móvil.
					</p>
				</article>
			</div>
		</section>
	);
}
