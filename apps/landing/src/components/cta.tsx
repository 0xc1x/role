export function Cta() {
	return (
		<section className="mx-auto max-w-6xl px-6 pb-32 pt-24">
			<div className="relative overflow-hidden rounded-[var(--radius-section)] bg-role-primary px-8 py-20 text-center text-white md:px-16">
				<div aria-hidden className="pointer-events-none absolute inset-0">
					<div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
					<div className="absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-role-primary-deep/70 blur-3xl" />
					<div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_100%,transparent_45%,rgb(143_20_18_0.5))]" />
				</div>
				<div className="relative reveal">
					<p className="text-sm font-semibold uppercase tracking-widest text-role-secondary mb-4">
						¿Listo para unirte?
					</p>
					<h2 className="font-heading text-3xl font-bold tracking-tight md:text-5xl">
						Únete al rol hoy mismo
					</h2>
					<p className="mx-auto mt-4 max-w-xl text-lg text-white/85">
						Descarga la app, encuentra ofertas cerca de ti y empieza a salvar
						comida hoy mismo.
					</p>
					<div className="mt-9 flex flex-wrap justify-center gap-4">
						<a
							href="role://"
							className="rounded-full bg-white px-8 py-3 font-semibold text-role-primary shadow-dark-glow transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl active:scale-[0.98]"
						>
							Abrir Rolé
						</a>
						<a
							href="/for-business"
							className="rounded-full border border-white/30 px-8 py-3 font-semibold text-white transition-colors duration-200 hover:bg-white/10"
						>
							Soy negocio
						</a>
					</div>
					<p className="mt-6 text-sm text-white/60">
						Sin cargo por registro. Disponible pronto en App Store y Google
						Play.
					</p>
				</div>
			</div>
		</section>
	);
}
