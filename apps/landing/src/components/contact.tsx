import { type FormEvent, useState } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Errors = Partial<Record<"name" | "email" | "message", string>>;

export function Contact() {
	const [errors, setErrors] = useState<Errors>({});

	function handleSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const form = e.currentTarget;
		const data = new FormData(form);
		const name = String(data.get("nombre") ?? "").trim();
		const email = String(data.get("correo") ?? "").trim();
		const message = String(data.get("mensaje") ?? "").trim();

		const next: Errors = {};
		if (!name) next.name = "Escribe tu nombre para poder responderte.";
		if (!email) next.email = "Necesitamos un correo para escribirte.";
		else if (!EMAIL_RE.test(email))
			next.email = "Ese correo no parece válido. Revísalo y vuelve a intentar.";
		if (message.length < 10)
			next.message = "Cuéntanos un poco más (mínimo 10 caracteres).";

		setErrors(next);
		if (Object.keys(next).length > 0) return;

		const subject = encodeURIComponent(`Contacto desde la web — ${name}`);
		const body = encodeURIComponent(`${email}\n\n${message}`);
		window.location.href = `mailto:hola@role.app?subject=${subject}&body=${body}`;
	}

	const fieldClass = (hasError: boolean) =>
		`w-full rounded-xl border bg-role-surface-muted px-4 py-3 outline-none transition-colors placeholder:text-role-muted-foreground/50 ${
			hasError
				? "border-role-primary"
				: "border-role-border focus:border-role-primary focus:ring-2 focus:ring-role-primary/20"
		}`;

	return (
		<section className="bg-role-surface-muted py-32">
			<div className="mx-auto grid max-w-6xl items-start gap-14 px-6 lg:grid-cols-2">
				<div className="reveal">
					<p className="text-sm font-semibold uppercase tracking-widest text-role-primary">
						Contacto
					</p>
					<h2 className="mt-3 font-heading text-3xl font-bold tracking-tight md:text-5xl">
						¿Tienes dudas? Escríbenos.
					</h2>
					<p className="mt-4 max-w-md text-lg leading-relaxed text-role-muted-foreground">
						Te ayudaremos con lo que necesites. Respondemos en menos de 24 horas
						entre semana.
					</p>
					<div className="mt-10 space-y-4 text-sm">
						<div className="flex items-center gap-3">
							<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-role-primary-soft text-lg">
								{/* biome-ignore lint/a11y/noSvgWithoutTitle: icono decorativo */}
								<svg
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden
									className="text-role-primary"
								>
									<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
									<polyline points="22,6 12,13 2,6" />
								</svg>
							</span>
							<div>
								<p className="font-semibold">Soporte</p>
								<a
									href="mailto:hola@role.app"
									className="text-role-muted-foreground transition-colors hover:text-role-primary"
								>
									hola@role.app
								</a>
							</div>
						</div>
						<div className="flex items-center gap-3">
							<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-role-primary-soft text-lg">
								{/* biome-ignore lint/a11y/noSvgWithoutTitle: icono decorativo */}
								<svg
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden
									className="text-role-primary"
								>
									<path d="M21 10V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v5" />
									<path d="M14 10v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8" />
								</svg>
							</span>
							<div>
								<p className="font-semibold">Para negocios</p>
								<a
									href="mailto:negocios@role.app"
									className="text-role-muted-foreground transition-colors hover:text-role-primary"
								>
									negocios@role.app
								</a>
							</div>
						</div>
						<div className="flex items-center gap-3">
							<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-role-primary-soft text-lg">
								{/* biome-ignore lint/a11y/noSvgWithoutTitle: icono decorativo */}
								<svg
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden
									className="text-role-primary"
								>
									<circle cx="12" cy="12" r="10" />
									<polyline points="12 6 12 12 16 14" />
								</svg>
							</span>
							<div>
								<p className="font-semibold">Horario</p>
								<p className="text-role-muted-foreground">
									Lun – Vie, 9:00 – 18:00
								</p>
							</div>
						</div>
					</div>
				</div>
				<form
					onSubmit={handleSubmit}
					noValidate
					className="reveal rounded-[var(--radius-section)] bg-white p-8 shadow-raised"
				>
					<div className="flex flex-col gap-2">
						<label htmlFor="contact-name" className="text-sm font-semibold">
							Nombre
						</label>
						<input
							id="contact-name"
							name="nombre"
							type="text"
							autoComplete="name"
							placeholder="Ana Torres"
							className={fieldClass(Boolean(errors.name))}
							aria-invalid={Boolean(errors.name)}
							aria-describedby={errors.name ? "contact-name-error" : undefined}
						/>
						{errors.name ? (
							<p
								id="contact-name-error"
								role="alert"
								className="text-sm text-role-primary"
							>
								{errors.name}
							</p>
						) : null}
					</div>
					<div className="mt-4 flex flex-col gap-2">
						<label htmlFor="contact-email" className="text-sm font-semibold">
							Correo electrónico
						</label>
						<input
							id="contact-email"
							name="correo"
							type="email"
							autoComplete="email"
							placeholder="ana@correo.com"
							className={fieldClass(Boolean(errors.email))}
							aria-invalid={Boolean(errors.email)}
							aria-describedby={
								errors.email ? "contact-email-error" : undefined
							}
						/>
						{errors.email ? (
							<p
								id="contact-email-error"
								role="alert"
								className="text-sm text-role-primary"
							>
								{errors.email}
							</p>
						) : null}
					</div>
					<div className="mt-4 flex flex-col gap-2">
						<label htmlFor="contact-message" className="text-sm font-semibold">
							Mensaje
						</label>
						<textarea
							id="contact-message"
							name="mensaje"
							rows={5}
							placeholder="Cuéntanos en qué podemos ayudarte..."
							className={fieldClass(Boolean(errors.message))}
							aria-invalid={Boolean(errors.message)}
							aria-describedby={
								errors.message ? "contact-message-error" : undefined
							}
						/>
						{errors.message ? (
							<p
								id="contact-message-error"
								role="alert"
								className="text-sm text-role-primary"
							>
								{errors.message}
							</p>
						) : null}
					</div>
					<button
						type="submit"
						className="mt-6 w-full rounded-full bg-role-primary px-6 py-3 font-semibold text-white shadow-soft transition-all duration-200 hover:bg-role-primary-hover hover:shadow-glow active:scale-[0.98]"
					>
						Enviar mensaje
					</button>
					<p className="mt-3 text-center text-xs text-role-muted-foreground">
						El mensaje se abre en tu cliente de correo.
					</p>
				</form>
			</div>
		</section>
	);
}
