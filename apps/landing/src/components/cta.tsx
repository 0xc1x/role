import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

type CtaProps = {
	variant?: "primary" | "muted";
	eyebrow?: string;
	title?: string;
	body?: string;
	primaryLabel?: string;
	primaryHref?: string;
	primaryIcon?: ReactNode;
	secondaryLabel?: string;
	secondaryHref?: string;
	foot?: string;
	icon?: ReactNode;
};

const VARIANT_STYLES = {
	primary: {
		section: "bg-role-primary text-white",
		eyebrow: "text-role-secondary",
		heading: "",
		body: "text-white/85",
		primaryButton:
			"bg-white text-role-primary shadow-dark-glow hover:bg-white hover:text-role-primary hover:shadow-2xl motion-safe:hover:-translate-y-0.5 focus-visible:ring-white focus-visible:ring-offset-role-primary",
		secondaryButton:
			"border border-white/30 bg-transparent text-white hover:bg-white hover:text-role-primary focus-visible:ring-white focus-visible:ring-offset-role-primary",
		foot: "text-white/60",
	},
	muted: {
		section: "bg-role-surface-muted text-ink",
		eyebrow: "text-ink-soft",
		heading: "font-display font-medium",
		body: "text-ink-soft",
		primaryButton:
			"bg-role-primary text-white shadow-soft hover:bg-role-primary-hover hover:text-white hover:shadow-glow focus-visible:ring-role-primary focus-visible:ring-offset-role-surface-muted",
		secondaryButton:
			"border border-role-border bg-transparent text-ink hover:bg-white hover:text-ink focus-visible:ring-role-primary focus-visible:ring-offset-role-surface-muted",
		foot: "text-role-muted-foreground",
	},
} as const;

export function Cta({
	variant = "primary",
	eyebrow = "¿Listo para unirte?",
	title = "Únete al rol hoy mismo",
	body = "Descarga la app, encuentra ofertas cerca de ti y empieza a salvar comida hoy mismo.",
	primaryLabel = "Abrir Rolé",
	primaryHref = "role://",
	primaryIcon,
	secondaryLabel = "Soy negocio",
	secondaryHref = "/for-business",
	foot = "Sin cargo por registro. Disponible pronto en App Store y Google Play.",
	icon,
}: CtaProps) {
	const isPrimary = variant === "primary";
	const styles = VARIANT_STYLES[variant];

	return (
		<section className="mx-auto max-w-6xl px-6 pb-32 pt-24">
			<div
				className={`relative overflow-hidden rounded-[var(--radius-section)] px-8 py-20 text-center md:px-16 ${styles.section}`}
			>
				<div aria-hidden className="pointer-events-none absolute inset-0">
					{isPrimary ? (
						<>
							<div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
							<div className="absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-role-primary-deep/70 blur-3xl" />
							<div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_100%,transparent_45%,rgb(144_27_53/0.5))]" />
						</>
					) : (
						<div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-role-primary/10 blur-3xl" />
					)}
				</div>

				<div className="relative reveal">
					{icon ? (
						<div aria-hidden className="mb-4 flex justify-center">
							{icon}
						</div>
					) : null}

					{eyebrow ? (
						<p
							className={`mb-4 text-sm font-semibold uppercase tracking-widest ${styles.eyebrow}`}
						>
							{eyebrow}
						</p>
					) : null}

					<h2
						className={`font-heading text-3xl font-bold tracking-tight md:text-5xl ${styles.heading}`}
					>
						{title}
					</h2>

					<p className={`mx-auto mt-4 max-w-xl text-lg ${styles.body}`}>
						{body}
					</p>

					<div className="mt-9 flex flex-wrap justify-center gap-4">
						<Button
							variant="ghost"
							render={<a href={primaryHref} />}
							className={`inline-flex items-center gap-2 rounded-full px-8 py-3 font-semibold active:scale-[0.98] ${styles.primaryButton}`}
						>
							{primaryIcon}
							{primaryLabel}
						</Button>
						{secondaryLabel && secondaryHref ? (
							<Button
								variant="ghost"
								render={<a href={secondaryHref} />}
								className={`rounded-full px-8 py-3 font-semibold ${styles.secondaryButton}`}
							>
								{secondaryLabel}
							</Button>
						) : null}
					</div>

					{foot ? (
						<p className={`mt-6 text-sm ${styles.foot}`}>{foot}</p>
					) : null}
				</div>
			</div>
		</section>
	);
}
