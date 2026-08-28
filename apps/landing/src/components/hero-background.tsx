export function HeroBackground() {
	return (
		<div aria-hidden className="pointer-events-none absolute inset-0">
			<div className="absolute inset-0 bg-gradient-to-br from-role-dark-bg via-role-dark-bg to-role-primary-deep/30" />
			<div className="absolute -top-32 right-0 h-96 w-96 animate-drift rounded-full bg-role-primary/20 blur-3xl" />
			<div className="absolute bottom-0 left-1/4 h-72 w-72 animate-drift-slow rounded-full bg-role-primary-deep/30 blur-3xl" />
			<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_40%,_rgb(18_18_18)_100%)]" />
		</div>
	);
}
