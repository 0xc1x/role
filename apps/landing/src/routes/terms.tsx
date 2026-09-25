import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { Footer } from "@/components/footer";
import { LegalHero } from "@/components/legal-hero";
import { Navbar } from "@/components/navbar";
import { Eyebrow } from "@/components/section";
import { formatLegalDate } from "@/lib/dates";
import { TERMS_SECTIONS } from "@/lib/legal/terms-content";
import { pageHead } from "@/lib/seo";
import { useConfig } from "@/lib/use-config";

export const Route = createFileRoute("/terms")({
	head: () =>
		pageHead(
			"/terms",
			"Términos | Rolé",
			"Términos y condiciones de uso de Rolé.",
		),
	component: TermsPage,
});

function TermsPage() {
	const contactEmail = useConfig(
		"legal.contact_email",
		"correo legal pendiente de configuración",
	);
	const controllerIdentity = useConfig(
		"legal.controller_identity",
		"el operador de Rolé (identidad legal pendiente de publicación)",
	);
	const sections = TERMS_SECTIONS.map((s) => ({
		...s,
		body: s.body
			.replace("{contactEmail}", contactEmail)
			.replace("{controllerIdentity}", controllerIdentity),
	}));
	const updatedRaw = useConfig("legal.terms_updated_at", "");
	const updatedDate = useMemo(() => formatLegalDate(updatedRaw), [updatedRaw]);

	return (
		<div className="min-h-screen">
			<Navbar />
			<main id="main">
				<LegalHero
					eyebrow="Legal · Términos"
					titlePrefix="Términos y"
					titleAccent="condiciones"
					description="Reglas claras para una comunidad justa. Qué esperamos de ti y qué puedes esperar de Rolé."
					updatedDate={updatedDate}
				/>

				<section className="mx-auto max-w-6xl px-6 pt-8">
					<div className="grid gap-4 md:grid-cols-3">
						{[
							{ k: "Pago", v: "En el comercio", d: "Sin intermediarios" },
							{ k: "Reserva", v: "Gratis", d: "Sin comisiones ocultas" },
							{ k: "Recogida", v: "Presencial", d: "En horario pactado" },
						].map((b) => (
							<div
								key={b.k}
								className="rounded-2xl border border-role-border bg-white p-5 shadow-soft"
							>
								<p className="text-xs font-bold uppercase tracking-widest text-role-muted-foreground">
									{b.k}
								</p>
								<p className="mt-1 font-heading text-lg font-bold text-role-foreground">
									{b.v}
								</p>
								<p className="text-xs text-role-muted-foreground">{b.d}</p>
							</div>
						))}
					</div>
				</section>

				<section className="mx-auto max-w-3xl px-6 py-20 md:py-28">
					<p className="text-sm font-semibold uppercase tracking-widest text-role-muted-foreground reveal">
						Del acuerdo a la práctica
					</p>
					<h2 className="mt-2 font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl reveal reveal-delay-1">
						Nueve puntos, lectura vertical
					</h2>
					<div className="mt-12 divide-y divide-role-border">
						{sections.map((s, i) => (
							<div
								key={s.title}
								id={`s-${i + 1}`}
								className="scroll-mt-28 py-10 reveal"
								style={
									{ transitionDelay: `${i * 40}ms` } as React.CSSProperties
								}
							>
								<p className="font-display text-5xl font-light tracking-tight text-role-primary/15">
									0{i + 1}
								</p>
								<h3 className="mt-3 font-heading text-xl font-bold tracking-tight text-role-foreground md:text-2xl">
									{s.title}
								</h3>
								<p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-role-muted-foreground">
									{s.body}
								</p>
							</div>
						))}
					</div>

					<div className="mt-12 rounded-[var(--radius-card)] bg-role-dark-bg p-8 text-white md:p-10">
						<Eyebrow className="text-white/60">Compromiso</Eyebrow>
						<h3 className="mt-2 font-heading text-xl font-bold">
							Juego limpio, por ambas partes
						</h3>
						<p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70">
							Si un comercio no cumple o un usuario abusa de las reservas,
							actuamos. Queremos una comunidad donde el excedente llegue a quien
							realmente lo valora.
						</p>
					</div>
				</section>
			</main>
			<Footer />
		</div>
	);
}
