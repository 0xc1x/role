import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { Footer } from "@/components/footer";
import { LegalHero } from "@/components/legal-hero";
import { Navbar } from "@/components/navbar";
import { formatLegalDate } from "@/lib/dates";
import { PRIVACY_SECTIONS } from "@/lib/legal/privacy-content";
import { pageHead } from "@/lib/seo";
import { useConfig } from "@/lib/use-config";

export const Route = createFileRoute("/privacy")({
	head: () =>
		pageHead(
			"/privacy",
			"Privacidad | Rolé",
			"Cómo tratamos tus datos personales en Rolé.",
		),
	component: PrivacyPage,
});

function PrivacyPage() {
	const contactEmail = useConfig(
		"privacy.contact_email",
		"correo de privacidad pendiente de configuración",
	);
	const controllerIdentity = useConfig(
		"legal.controller_identity",
		"el operador de Rolé (identidad legal pendiente de publicación)",
	);
	const sections = PRIVACY_SECTIONS.map((s) => ({
		...s,
		body: s.body
			.replace("{contactEmail}", contactEmail)
			.replace("{controllerIdentity}", controllerIdentity),
	}));
	const updatedRaw = useConfig("legal.privacy_updated_at", "");
	const updatedDate = useMemo(() => formatLegalDate(updatedRaw), [updatedRaw]);

	return (
		<div className="min-h-screen">
			<Navbar />
			<main id="main">
				<LegalHero
					eyebrow="Legal · Privacidad"
					titlePrefix="Política de"
					titleAccent="privacidad"
					description="Transparencia total sobre qué datos recopilamos, cómo los usamos y qué control tienes. Sin letra pequeña."
					updatedDate={updatedDate}
				/>

				<section className="mx-auto max-w-3xl px-6 py-20 md:py-28">
					<p className="text-sm font-semibold uppercase tracking-widest text-role-muted-foreground reveal">
						Del dato a tu control
					</p>
					<h2 className="mt-2 font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl reveal reveal-delay-1">
						Once puntos, lectura vertical
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

					<div className="mt-12 grid gap-4 border-t border-role-border pt-10 sm:grid-cols-3">
						{[
							{ t: "Tránsito protegido", d: "Conexiones cifradas con HTTPS" },
							{ t: "Uso limitado", d: "Solo para las finalidades indicadas" },
							{
								t: "Derechos claros",
								d: "Solicita acceso, corrección o supresión",
							},
						].map((f) => (
							<div key={f.t} className="border-l-2 border-role-primary/20 pl-4">
								<p className="text-sm font-semibold text-role-foreground">
									{f.t}
								</p>
								<p className="mt-1 text-xs text-role-muted-foreground">{f.d}</p>
							</div>
						))}
					</div>
				</section>
			</main>
			<Footer />
		</div>
	);
}
