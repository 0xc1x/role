export const STATS = [
	{ value: "50K+", label: "Usuarios activos" },
	{ value: "2000+", label: "Comercios" },
	{ value: "100K+", label: "Comidas salvadas" },
];

export function Hero() {
	return (
		<section className="relative overflow-hidden bg-role-primary text-white">
			<div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 lg:grid-cols-2">
				<div>
					<p className="mb-4 inline-block rounded-full bg-white/15 px-4 py-1 text-sm font-medium">
						🥗 Rescata comida deliciosa a precio increíble
					</p>
					<h1 className="font-heading text-4xl font-extrabold leading-tight md:text-5xl lg:text-6xl">
						Comida deliciosa. Mitad de precio. Cero desperdicio.
					</h1>
					<p className="mt-6 max-w-lg text-lg text-white/85">
						Rolé conecta comercios locales con excedente de comida con personas
						que quieren comer bien por menos. Menos desperdicio, más comunidad.
					</p>
					<div className="mt-8 flex flex-wrap gap-4">
						<a
							href="role://"
							className="rounded-full bg-white px-7 py-3 font-semibold text-role-primary transition-opacity hover:opacity-90"
						>
							Descargar la app
						</a>
						<a
							href="/for-business"
							className="rounded-full border-2 border-white/40 px-7 py-3 font-semibold text-white transition-colors hover:bg-white/10"
						>
							Para negocios
						</a>
					</div>
					<div className="mt-12 flex gap-8">
						{STATS.map((s) => (
							<div key={s.label}>
								<p className="font-heading text-2xl font-bold md:text-3xl">
									{s.value}
								</p>
								<p className="text-sm text-white/70">{s.label}</p>
							</div>
						))}
					</div>
				</div>
				<div className="hidden lg:block">
					<div className="rounded-3xl bg-white/10 p-6 backdrop-blur">
						<div className="flex items-center gap-4 rounded-2xl bg-role-card p-5 text-role-foreground">
							<div className="flex h-14 w-14 items-center justify-center rounded-xl bg-role-primary text-2xl text-white">
								🍞
							</div>
							<div className="flex-1">
								<p className="font-semibold">Panadería La Espiga</p>
								<p className="text-sm text-role-muted-foreground">
									Pan artesanal · Centro
								</p>
							</div>
							<div className="text-right">
								<p className="text-sm line-through text-role-muted-foreground">
									$120
								</p>
								<p className="font-heading text-xl font-bold text-role-primary">
									$36
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
