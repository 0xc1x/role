export function Cta() {
	return (
		<section className="bg-role-primary py-20 text-center text-white">
			<div className="mx-auto max-w-3xl px-6">
				<h2 className="font-heading text-3xl font-bold md:text-4xl">
					¿Listo para unirte al rol?
				</h2>
				<p className="mt-4 text-lg text-white/85">
					Descarga la app, encuentra ofertas cerca de ti y empieza a salvar
					comida hoy mismo.
				</p>
				<div className="mt-8 flex justify-center gap-4">
					<a
						href="role://"
						className="rounded-full bg-white px-8 py-3 font-semibold text-role-primary transition-opacity hover:opacity-90"
					>
						Abrir Rolé
					</a>
					<a
						href="/for-business"
						className="rounded-full border-2 border-white/40 px-8 py-3 font-semibold text-white transition-colors hover:bg-white/10"
					>
						Soy negocio
					</a>
				</div>
			</div>
		</section>
	);
}
