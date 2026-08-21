import { Link, useMatchRoute, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Wordmark } from "@/components/brand";

const NAV = [
	{ label: "Cómo funciona", href: "/how-it-works" },
	{ label: "Para negocios", href: "/for-business" },
	{ label: "Ayuda", href: "/help-center" },
	{ label: "Sobre nosotros", href: "/about" },
];

const DARK_HERO_ROUTES = new Set([
	"/",
	"/how-it-works",
	"/for-business",
	"/about",
	"/help-center",
]);

export function Navbar() {
	const [open, setOpen] = useState(false);
	const [pastHero, setPastHero] = useState(false);
	const [heroBottom, setHeroBottom] = useState(0);
	const matchRoute = useMatchRoute();
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	// Mide dónde termina el hero de la ruta actual: la navbar cambia
	// de transparente a vidrio esmerilado al pasarlo (estilo Cheaf).
	useEffect(() => {
		const measure = () => {
			const hero = document.querySelector("[data-hero]");
			setHeroBottom(
				hero ? hero.getBoundingClientRect().bottom + window.scrollY : 0,
			);
		};
		measure();
		// Re-mide cuando cargan imágenes/fuentes que alteran la altura.
		const t = setTimeout(measure, 600);
		window.addEventListener("resize", measure);
		return () => {
			clearTimeout(t);
			window.removeEventListener("resize", measure);
		};
	}, []);

	useEffect(() => {
		const handleScroll = () => setPastHero(window.scrollY > heroBottom - 64);
		handleScroll();
		window.addEventListener("scroll", handleScroll, { passive: true });
		return () => window.removeEventListener("scroll", handleScroll);
	}, [heroBottom]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: cierra el menú al navegar
	useEffect(() => {
		setOpen(false);
	}, [pathname]);

	const overDarkHero = DARK_HERO_ROUTES.has(pathname);
	const solid = pastHero || !overDarkHero;

	return (
		<header className="fixed inset-x-0 top-0 z-50 flex flex-col items-center px-3 pt-3 md:px-6 md:pt-4">
			<div
				className={`w-full max-w-6xl rounded-2xl border transition-all duration-500 ${
					solid
						? "border-role-border/40 bg-role-background shadow-[0_10px_17px_-5px_rgb(76_80_133_0.2)]"
						: `border-white/10 backdrop-blur-[15px] ${
								open ? "bg-white/10" : "bg-transparent"
							}`
				}`}
			>
				<div className="flex h-14 items-center justify-between px-4 md:h-16 md:px-5">
					<Link to="/" className="flex items-center" aria-label="Rolé — Inicio">
						<Wordmark
							className={`h-9 w-auto transition-colors duration-500 md:h-10 ${
								solid ? "text-role-foreground" : "text-white"
							}`}
						/>
					</Link>

					<nav
						className="hidden items-center gap-1 md:flex"
						aria-label="Principal"
					>
						{NAV.map((item) => {
							const isActive = Boolean(
								matchRoute({ to: item.href, fuzzy: true }),
							);
							return (
								<Link
									key={item.href}
									to={item.href}
									className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 ${
										solid
											? isActive
												? "bg-role-primary-soft text-role-primary"
												: "text-role-muted-foreground hover:bg-role-muted/60 hover:text-role-foreground"
											: isActive
												? "bg-white/15 text-white backdrop-blur-sm"
												: "text-white/80 hover:bg-white/10 hover:text-white"
									}`}
								>
									{item.label}
								</Link>
							);
						})}
					</nav>

					<div className="flex items-center gap-2">
						<a
							href="role://"
							className={`hidden items-center justify-center rounded-full px-5 py-2 text-sm font-semibold transition-all duration-300 active:scale-[0.98] md:inline-flex ${
								solid
									? "bg-role-primary text-white shadow-soft hover:bg-role-primary-hover hover:shadow-glow"
									: "bg-white text-role-primary shadow-dark-glow hover:bg-white/90"
							}`}
						>
							Conseguir la app
						</a>
						<button
							type="button"
							onClick={() => setOpen((v) => !v)}
							aria-expanded={open}
							aria-controls="mobile-menu"
							aria-label={open ? "Cerrar menú" : "Abrir menú"}
							className={`rounded-full p-2.5 transition-colors md:hidden ${
								solid
									? "text-role-foreground hover:bg-role-muted"
									: "text-white hover:bg-white/10"
							}`}
						>
							{/* biome-ignore lint/a11y/noSvgWithoutTitle: icono decorativo */}
							<svg
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								aria-hidden
								focusable="false"
							>
								{open ? (
									<path d="M18 6 6 18M6 6l12 12" />
								) : (
									<path d="M3 7h18M3 12h18M3 17h18" />
								)}
							</svg>
						</button>
					</div>
				</div>

				{open ? (
					<nav
						id="mobile-menu"
						className="animate-menu-in px-3 pb-3 md:hidden"
						aria-label="Menú móvil"
					>
						<div className="rounded-3xl border border-role-border/50 bg-white/95 p-3 shadow-raised backdrop-blur-xl">
							<ul className="space-y-1">
								{NAV.map((item, index) => {
									const isActive = Boolean(
										matchRoute({ to: item.href, fuzzy: true }),
									);
									return (
										<li
											key={item.href}
											className="animate-item-in"
											style={{ animationDelay: `${index * 60}ms` }}
										>
											<Link
												to={item.href}
												className={`block rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${
													isActive
														? "bg-role-primary-soft text-role-primary"
														: "text-role-muted-foreground hover:bg-role-muted hover:text-role-foreground"
												}`}
											>
												{item.label}
											</Link>
										</li>
									);
								})}
							</ul>
							<a
								href="role://"
								className="animate-item-in mt-2 block rounded-full bg-role-primary px-5 py-3 text-center text-sm font-semibold text-white transition-all duration-200 hover:bg-role-primary-hover active:scale-[0.98]"
								style={{ animationDelay: `${NAV.length * 60}ms` }}
							>
								Conseguir la app
							</a>
						</div>
					</nav>
				) : null}
			</div>
		</header>
	);
}
