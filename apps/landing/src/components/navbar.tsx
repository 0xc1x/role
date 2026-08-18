import { Link } from "@tanstack/react-router";

const NAV = [
	{ label: "Cómo funciona", href: "/how-it-works" },
	{ label: "Para negocios", href: "/for-business" },
	{ label: "Ayuda", href: "/help-center" },
	{ label: "Sobre nosotros", href: "/about" },
];

export function Navbar() {
	return (
		<header className="sticky top-0 z-50 border-b border-role-border bg-role-background/95 backdrop-blur">
			<div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
				<Link to="/" className="flex items-center gap-2">
					<span className="flex h-8 w-8 items-center justify-center rounded-lg bg-role-primary font-heading text-lg font-bold text-white">
						R
					</span>
					<span className="font-heading text-xl font-bold">Rolé</span>
				</Link>
				<nav className="hidden items-center gap-6 md:flex">
					{NAV.map((item) => (
						<Link
							key={item.href}
							to={item.href}
							className="text-sm font-medium text-role-muted-foreground transition-colors hover:text-role-foreground"
						>
							{item.label}
						</Link>
					))}
				</nav>
				<a
					href="role://"
					className="hidden rounded-full bg-role-primary px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 md:block"
				>
					Abrir la app
				</a>
			</div>
		</header>
	);
}
