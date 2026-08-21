import { Wordmark } from "@/components/brand";
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
		<footer className="relative bg-role-dark-bg text-white pt-32 pb-10 px-6 overflow-hidden">
			{/* Watermark wordmark */}
			<div
				aria-hidden
				className="pointer-events-none absolute top-0 left-0 w-full flex justify-center items-start pt-10 overflow-hidden opacity-[0.03] select-none"
			>
				<Wordmark className="w-[55vw] max-w-[60rem] h-auto text-white" />
			</div>

			{/* Accent blend - like Floria's hero-accent in footer */}
			<div
				aria-hidden
				className="pointer-events-none absolute -bottom-1/4 -right-20 md:-right-64 w-[400px] md:w-[800px] h-[400px] md:h-[800px] opacity-15 mix-blend-screen overflow-hidden"
			>
				<div className="absolute inset-0 bg-gradient-to-tr from-role-primary/30 via-transparent to-role-secondary/20 rounded-full blur-3xl rotate-12" />
			</div>

			<div className="relative z-10 mx-auto max-w-6xl">
				<div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8 mb-16 mt-8">
					{/* Brand column - spans 5 */}
					<div className="md:col-span-5 flex flex-col">
						<div className="flex flex-col mb-8">
							<Wordmark className="h-16 md:h-24 w-auto text-white mb-2" />
							<p className="text-xl md:text-2xl editorial italic text-role-secondary opacity-90">
								Comida deliciosa. Mitad de precio.
							</p>
						</div>
						<p className="text-role-dark-muted max-w-[35ch] leading-relaxed text-lg">
							Rescatamos comida deliciosa del desperdicio y la ponemos a precios
							increíbles. Menos desperdicio, más comunidad.
						</p>
						<a
							href="role://"
							className="mt-6 inline-block rounded-full bg-role-primary px-6 py-2 text-sm font-semibold text-white shadow-soft transition-all duration-200 hover:bg-role-primary-hover hover:shadow-glow active:scale-[0.98]"
						>
							Conseguir la app
						</a>
					</div>

					{/* Explore column - spans 2 */}
					<div className="md:col-span-2 md:col-start-7">
						<h4 className="font-semibold text-sm mb-5 uppercase tracking-widest text-role-dark-muted">
							Explorar
						</h4>
						<ul className="flex flex-col gap-3 text-role-dark-muted">
							{EXPLORE.map((l) => (
								<li key={l.href}>
									<a
										href={l.href}
										className="hover:text-white transition-colors duration-200"
									>
										{l.label}
									</a>
								</li>
							))}
						</ul>
					</div>

					{/* Legal/Support column - spans 2 */}
					<div className="md:col-span-2">
						<h4 className="font-semibold text-sm mb-5 uppercase tracking-widest text-role-dark-muted">
							Legal
						</h4>
						<ul className="flex flex-col gap-3 text-role-dark-muted">
							{LEGAL.map((l) => (
								<li key={l.href}>
									<a
										href={l.href}
										className="hover:text-white transition-colors duration-200"
									>
										{l.label}
									</a>
								</li>
							))}
						</ul>
						<p className="mt-8 text-role-dark-muted leading-relaxed">
							Disponible pronto en App Store y Google Play.
						</p>
					</div>

					{/* Contact column - spans 2 */}
					<div className="md:col-span-2">
						<h4 className="font-semibold text-sm mb-5 uppercase tracking-widest text-role-dark-muted">
							Contacto
						</h4>
						<div className="flex flex-col gap-3 text-role-dark-muted">
							<a
								href={`mailto:${holaEmail}`}
								className="hover:text-white transition-colors duration-200 flex items-center gap-2"
							>
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
									<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
									<polyline points="22,6 12,13 2,6" />
								</svg>
								{holaEmail}
							</a>
							<a
								href={`mailto:${negociosEmail}`}
								className="hover:text-white transition-colors duration-200 flex items-center gap-2"
							>
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
									<path d="M21 10V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v5" />
									<path d="M14 10v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8" />
								</svg>
								{negociosEmail}
							</a>
						</div>
					</div>
				</div>

				{/* Bottom bar with copyright + social */}
				<div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-white/10 text-sm text-role-dark-muted">
					<p>
						© {new Date().getFullYear()} Rolé. Todos los derechos reservados.
					</p>
					<div className="flex gap-6 mt-4 md:mt-0">
						{SOCIAL.map((s) => (
							<a
								key={s.label}
								href={s.href}
								className="uppercase tracking-widest text-xs font-semibold hover:text-white transition-colors duration-200"
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
