import { LogoMark, Wordmark } from "@/components/brand";
import { useConfig } from "@/lib/use-config";

const EXPLORE = [
	{ label: "Cómo funciona", href: "/how-it-works" },
	{ label: "Para negocios", href: "/for-business" },
	{ label: "Centro de ayuda", href: "/help-center" },
	{ label: "Sobre nosotros", href: "/about" },
];

const LEGAL = [
	{ label: "Privacidad", href: "/privacy" },
	{ label: "Términos y condiciones", href: "/terms" },
];

const SOCIAL_FALLBACKS = {
	"social.instagram_url": "#",
	"social.twitter_url": "#",
	"social.linkedin_url": "#",
} as const;

export function Footer() {
	const instagram = useConfig(
		"social.instagram_url",
		SOCIAL_FALLBACKS["social.instagram_url"],
	);
	const twitter = useConfig(
		"social.twitter_url",
		SOCIAL_FALLBACKS["social.twitter_url"],
	);
	const linkedin = useConfig(
		"social.linkedin_url",
		SOCIAL_FALLBACKS["social.linkedin_url"],
	);
	const holaEmail = useConfig("contact.hola_email", "hola@role.app");
	const negociosEmail = useConfig(
		"contact.negocios_email",
		"negocios@role.app",
	);

	const SOCIAL = [
		{ label: "Instagram", href: instagram },
		{ label: "Twitter", href: twitter },
		{ label: "LinkedIn", href: linkedin },
	];

	return (
		<footer className="bg-ink pb-24 text-cream md:pb-0">
			<div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-20">
				<div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr]">
					<div>
						<a
							href="/"
							className="inline-flex items-center gap-2 rounded-2xl bg-paper p-2"
							aria-label="Rolé — Inicio"
						>
							<LogoMark className="h-5 w-auto text-ink" />
							<Wordmark className="h-5 w-auto text-ink" />
						</a>
						<p className="mt-5 max-w-sm text-sm leading-relaxed text-cream/70">
							Rescatamos comida deliciosa del desperdicio y la ponemos a precios
							increíbles. Menos desperdicio, más comunidad.
						</p>
						<a
							href="#contacto"
							className="mt-6 inline-block text-sm font-medium text-cream underline-offset-4 hover:underline"
						>
							Hablar con el equipo
						</a>
					</div>
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.16em] text-cream/50">
							Explorar
						</p>
						<ul className="mt-4 flex flex-col gap-2.5">
							{EXPLORE.map((l) => (
								<li key={l.href}>
									<a
										href={l.href}
										className="text-sm text-cream/80 transition-colors duration-150 hover:text-cream"
									>
										{l.label}
									</a>
								</li>
							))}
						</ul>
					</div>
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.16em] text-cream/50">
							Legal
						</p>
						<ul className="mt-4 flex flex-col gap-2.5">
							{LEGAL.map((l) => (
								<li key={l.href}>
									<a
										href={l.href}
										className="text-sm text-cream/80 transition-colors duration-150 hover:text-cream"
									>
										{l.label}
									</a>
								</li>
							))}
						</ul>
						<p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-cream/50">
							Contacto
						</p>
						<div className="mt-4 flex flex-col gap-2">
							<a
								href={`mailto:${holaEmail}`}
								className="text-sm text-cream/80 transition-colors duration-150 hover:text-cream"
							>
								{holaEmail}
							</a>
							<a
								href={`mailto:${negociosEmail}`}
								className="text-sm text-cream/80 transition-colors duration-150 hover:text-cream"
							>
								{negociosEmail}
							</a>
						</div>
					</div>
				</div>
				<div className="mt-16 flex flex-col gap-3 border-t border-cream/10 pt-6 text-xs text-cream/50 sm:flex-row sm:items-center sm:justify-between">
					<p>
						© {new Date().getFullYear()} Füdi. Todos los derechos reservados.
					</p>
					<div className="flex gap-6">
						{SOCIAL.map((s) => (
							<a
								key={s.label}
								href={s.href}
								className="text-xs font-semibold uppercase tracking-widest transition-colors duration-150 hover:text-cream"
							>
								{s.label}
							</a>
						))}
					</div>
				</div>
			</div>
		</footer>
	);
}
