import { Link, useMatchRoute, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerTitle,
} from "@/components/ui/drawer";
import { useStoreLink } from "@/lib/store-links";

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
	"/privacy",
	"/terms",
]);

/**
 * `children` se renderiza DENTRO del `<header>`, debajo de la barra.
 *
 * Es lo que permite que un aviso del operador forme parte de la navbar en vez de
 * empujar el contenido. La alternativa —una banda en el flujo de `<main>`— choca
 * con que el `<header>` es `fixed`: el primer hijo de `<main>` queda dibujado
 * debajo de él, así que la banda se veía translúcida bajo el `backdrop-blur` y
 * había que abrirle un hueco con un `pt`, que no es despejar la navbar sino
 * abrir un agujero en la página. Adentro no hay nada que reservar: la navbar crece,
 * y crece con el mismo comportamiento de color que el resto.
 *
 * El hijo se estila contra `group-data-[solid=true]:`, no contra una prop. El
 * estado de "sólida o transparente" es de la navbar y ella lo publica en el DOM;
 * quien se monte adentro lo lee de ahí y no hay drilling ni contrato nuevo entre
 * los dos.
 */
export function Navbar({ children }: { children?: ReactNode }) {
	const [open, setOpen] = useState(false);
	const [pastHero, setPastHero] = useState(false);
	const [heroBottom, setHeroBottom] = useState(0);
	const [headerHeight, setHeaderHeight] = useState(64);
	const headerRef = useRef<HTMLElement | null>(null);
	const matchRoute = useMatchRoute();
	const storeLink = useStoreLink();
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

	// Su PROPIA altura, y no un 64 cableado.
	//
	// El umbral del scroll usa la altura del header entero, y el header ya no es
	// una barra de 56/64px: si lleva un aviso adentro, es más alto. Con el 64 fijo
	// la navbar se volvía sólida 56px tarde y el aviso ya había pasado a texto
	// oscuro sobre el hero oscuro — texto sobre fondo del mismo color, que es peor
	// que el hueco que esto viene a arreglar. Un `ResizeObserver` además cubre lo
	// que el `setTimeout(600)` de arriba no: que el aviso llegue DESPUÉS del
	// primer render.
	useEffect(() => {
		const header = headerRef.current;
		if (!header) return;
		const read = () => setHeaderHeight(header.offsetHeight);
		read();
		const observer = new ResizeObserver(read);
		observer.observe(header);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const handleScroll = () =>
			setPastHero(window.scrollY > heroBottom - headerHeight);
		handleScroll();
		window.addEventListener("scroll", handleScroll, { passive: true });
		return () => window.removeEventListener("scroll", handleScroll);
	}, [heroBottom, headerHeight]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: cierra el menú al navegar
	useEffect(() => {
		setOpen(false);
	}, [pathname]);

	const overDarkHero = DARK_HERO_ROUTES.has(pathname);
	const solid = pastHero || !overDarkHero;
	const headerSolid = solid || open;

	return (
		<>
			<header
				ref={headerRef}
				// `data-solid` es el estado publicado para lo que se monte en
				// `children`: el aviso lee `group-data-[solid=true]:` y no necesita
				// que le pasen el color por prop. El `group` va acá, en el `<header>`,
				// para que el estado de la navbar alcance a toda su descendencia.
				data-solid={headerSolid}
				className={`group fixed inset-x-0 top-0 z-50 border-b ${open ? "transition-none" : "transition-all duration-500"} ${
					headerSolid
						? "border-role-border/40 bg-white shadow-soft"
						: "border-white/10 bg-transparent backdrop-blur-[15px]"
				}`}
			>
				<div className="mx-auto w-full max-w-6xl">
					<div className="flex h-14 items-center justify-between px-4 md:h-16 md:px-5">
						<Link
							to="/"
							className="flex items-center"
							aria-label="Rolé — Inicio"
						>
							{/* Crossfade: wordmark mono en blanco sobre el hero oscuro,
							    color de marca al pasar a navbar sólida. */}
							<span className="relative block h-9 md:h-10">
								<Wordmark
									className={`h-full w-auto transition-opacity duration-500 ${headerSolid ? "opacity-100" : "opacity-0"}`}
								/>
								<Wordmark
									mono
									className={`absolute left-0 top-0 h-full w-auto text-white transition-opacity duration-500 ${headerSolid ? "opacity-0" : "opacity-100"}`}
								/>
							</span>
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
							<Button
								variant="brand"
								render={<a href={storeLink} aria-label="Consigue la app" />}
								className={`hidden rounded-full px-5 py-2 text-sm font-semibold active:scale-[0.98] md:inline-flex ${
									solid
										? ""
										: "bg-white text-role-primary shadow-dark-glow hover:bg-white/90 hover:text-role-primary"
								}`}
							>
								Consigue la app
							</Button>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => setOpen((v) => !v)}
								aria-expanded={open}
								aria-controls="mobile-menu"
								aria-label={open ? "Cerrar menú" : "Abrir menú"}
								className={`rounded-full md:hidden ${headerSolid ? "text-role-foreground hover:bg-role-muted hover:text-role-foreground" : "text-white hover:bg-white/10 hover:text-white"}`}
							>
								<svg
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									aria-hidden="true"
									focusable="false"
								>
									{open ? (
										<path d="M18 6 6 18M6 6l12 12" />
									) : (
										<path d="M3 7h18M3 12h18M3 17h18" />
									)}
								</svg>
							</Button>
						</div>
					</div>
				</div>
				{/*
				 * El aviso va acá, adentro del `<header>` y DEBAJO de la barra de
				 * `max-w-6xl`: así el `backdrop-blur` y el fondo de la navbar lo
				 * cubren a él también, y no hay una segunda superficie que pueda
				 * quedar de un color distinto del header.
				 */}
				{children}
			</header>

			<Drawer
				open={open}
				onOpenChange={setOpen}
				swipeDirection="right"
				modal={true}
			>
				<DrawerContent
					aria-label="Menú móvil"
					className="border-0 bg-white p-0 text-ink md:hidden [&>div]:overflow-visible"
				>
					<DrawerTitle className="sr-only">Menú de navegación</DrawerTitle>
					<DrawerDescription className="sr-only">
						Navega por las secciones de Rolé
					</DrawerDescription>
					<nav
						id="mobile-menu"
						className="flex flex-col p-6 pt-8"
						aria-label="Menú móvil"
					>
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
											onClick={() => setOpen(false)}
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
						<Button
							variant="brand"
							render={<a href={storeLink} aria-label="Consigue la app" />}
							className="animate-item-in mt-4 w-full rounded-full px-5 py-3 text-sm font-semibold"
							style={
								{
									animationDelay: `${NAV.length * 60}ms`,
								} as React.CSSProperties
							}
						>
							Consigue la app
						</Button>
					</nav>
				</DrawerContent>
			</Drawer>
		</>
	);
}
