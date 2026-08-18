const LINKS = {
	empresa: [
		{ label: "Sobre nosotros", href: "/about" },
		{ label: "Para negocios", href: "/for-business" },
		{ label: "Cómo funciona", href: "/how-it-works" },
	],
	soporte: [
		{ label: "Centro de ayuda", href: "/help-center" },
		{ label: "Privacidad", href: "/privacy" },
		{ label: "Términos y condiciones", href: "/terms" },
	],
};

export function Footer() {
	return (
		<footer className="border-t border-role-border bg-white">
			<div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-4">
				<div>
					<div className="flex items-center gap-2">
						<span className="flex h-8 w-8 items-center justify-center rounded-lg bg-role-primary font-heading text-lg font-bold text-white">
							R
						</span>
						<span className="font-heading text-xl font-bold">Rolé</span>
					</div>
					<p className="mt-4 max-w-xs text-sm leading-relaxed text-role-muted-foreground">
						Rescatamos comida deliciosa del desperdicio y la ponemos a precios
						increíbles.
					</p>
				</div>
				<div>
					<p className="font-heading font-bold">Rolé</p>
					<ul className="mt-4 space-y-2 text-sm">
						{LINKS.empresa.map((l) => (
							<li key={l.href}>
								<a
									href={l.href}
									className="text-role-muted-foreground transition-colors hover:text-role-primary"
								>
									{l.label}
								</a>
							</li>
						))}
					</ul>
				</div>
				<div>
					<p className="font-heading font-bold">Soporte</p>
					<ul className="mt-4 space-y-2 text-sm">
						{LINKS.soporte.map((l) => (
							<li key={l.href}>
								<a
									href={l.href}
									className="text-role-muted-foreground transition-colors hover:text-role-primary"
								>
									{l.label}
								</a>
							</li>
						))}
					</ul>
				</div>
				<div>
					<p className="font-heading font-bold">Descarga</p>
					<p className="mt-4 text-sm text-role-muted-foreground">
						Disponible pronto en App Store y Google Play.
					</p>
					<a
						href="role://"
						className="mt-4 inline-block rounded-full bg-role-primary px-6 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
					>
						Abrir la app
					</a>
				</div>
			</div>
			<div className="border-t border-role-border py-6 text-center text-sm text-role-muted-foreground">
				© {new Date().getFullYear()} Rolé. Todos los derechos reservados.
			</div>
		</footer>
	);
}
