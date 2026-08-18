export function Contact() {
	return (
		<section className="bg-role-muted py-24">
			<div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-2">
				<div>
					<h2 className="font-heading text-3xl font-bold md:text-4xl">
						¿Tienes dudas?
					</h2>
					<p className="mt-4 text-lg leading-relaxed text-role-muted-foreground">
						Escríbenos y te ayudaremos con lo que necesites. Nos encanta
						escuchar a nuestra comunidad.
					</p>
					<div className="mt-8 space-y-3 text-sm">
						<p>
							<span className="font-semibold">Soporte:</span> hola@role.app
						</p>
						<p>
							<span className="font-semibold">Para negocios:</span>{" "}
							negocios@role.app
						</p>
						<p>
							<span className="font-semibold">Horario:</span> Lun – Vie, 9:00 –
							18:00
						</p>
					</div>
				</div>
				<form
					action="mailto:hola@role.app"
					className="rounded-2xl border border-role-border bg-white p-8"
				>
					<div className="flex flex-col gap-2">
						<label htmlFor="contact-name" className="text-sm font-semibold">
							Nombre
						</label>
						<input
							id="contact-name"
							name="nombre"
							required
							className="rounded-xl border border-role-border bg-role-background px-4 py-3 outline-none focus:border-role-primary"
						/>
					</div>
					<div className="mt-4 flex flex-col gap-2">
						<label htmlFor="contact-email" className="text-sm font-semibold">
							Correo electrónico
						</label>
						<input
							id="contact-email"
							name="correo"
							type="email"
							required
							className="rounded-xl border border-role-border bg-role-background px-4 py-3 outline-none focus:border-role-primary"
						/>
					</div>
					<div className="mt-4 flex flex-col gap-2">
						<label htmlFor="contact-message" className="text-sm font-semibold">
							Mensaje
						</label>
						<textarea
							id="contact-message"
							name="mensaje"
							required
							rows={5}
							className="rounded-xl border border-role-border bg-role-background px-4 py-3 outline-none focus:border-role-primary"
						/>
					</div>
					<button
						type="submit"
						className="mt-6 w-full rounded-full bg-role-primary px-6 py-3 font-semibold text-white transition-opacity hover:opacity-90"
					>
						Enviar mensaje
					</button>
				</form>
			</div>
		</section>
	);
}
