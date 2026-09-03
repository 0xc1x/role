import { createFileRoute } from "@tanstack/react-router";

import { Footer } from "@/components/footer";
import { HeroBackground } from "@/components/hero-background";
import { ShieldIcon } from "@/components/icons";
import { Navbar } from "@/components/navbar";
import { useConfig } from "@/lib/use-config";

export const Route = createFileRoute("/privacy")({
	component: PrivacyPage,
});

const SECTIONS = [
	{
		title: "Responsable del tratamiento",
		body: "Rolé (operado por 0xC1X S.A.S., RUC 1799999999001, domicilio Quito, Ecuador) es responsable del tratamiento de tus datos personales a través de la app móvil y la web. Contacto de privacidad: {contactEmail}.",
	},
	{
		title: "Normativa aplicable",
		body: "Tratamos tus datos conforme a la Ley Orgánica de Protección de Datos Personales (LOPDP, RO Suplemento 459 de 26 de mayo de 2021), su Reglamento y la Constitución del Ecuador (Art. 66.19). Esta política se interpreta bajo ley ecuatoriana.",
	},
	{
		title: "Datos que recopilamos",
		body: "Automáticos: IP anonimizada, tipo de navegador/SO, páginas vistas, duración, fecha/hora y referer. Voluntarios: nombre, correo, teléfono, ubicación aproximada, preferencias, datos de reserva (oferta, comercio, horario de recogida) y mensajes de contacto. No solicitamos datos sensibles salvo que tú los aportes.",
	},
	{
		title: "Finalidades",
		body: "Proveer y mantener el servicio; procesar reservas y coordinar recogidas; mostrarte ofertas cercanas; enviarte notificaciones transaccionales; mejorar la experiencia y obtener estadísticas agregadas; cumplir obligaciones legales y prevenir fraude.",
	},
	{
		title: "Base legal",
		body: "Ejecución del contrato (reserva), consentimiento (marketing/cookies no esenciales), interés legítimo (mejora y seguridad) y cumplimiento legal. Puedes retirar el consentimiento en cualquier momento sin afectar tratamientos previos.",
	},
	{
		title: "Conservación",
		body: "Navegación y logs: hasta 12 meses. Datos de cuenta y reservas: mientras mantengas la cuenta y 24 meses tras la baja, salvo obligación legal mayor. Contacto: hasta revocar consentimiento.",
	},
	{
		title: "Destinatarios y transferencias",
		body: "Compartimos lo mínimo necesario con: comercios (para tu reserva), y encargados técnicos: Supabase (base de datos), Vercel (hosting), Sentry (observabilidad), Firebase/Google (push y mapas). Algunos servidores están en EE. UU./UE; aplicamos cláusulas tipo u otras garantías adecuadas y DPAs vigentes.",
	},
	{
		title: "Tus derechos",
		body: "Acceso, rectificación, supresión, oposición, portabilidad, limitación y a no ser objeto de decisiones automatizadas. Ejerce escribiendo a {contactEmail} con cédula, derecho solicitado y medio de respuesta. Respondemos en máximo 15 días (Art. 26 Reglamento LOPDP); puedes reclamar ante la SPDP si no estás conforme.",
	},
	{
		title: "Seguridad",
		body: "Cifrado SSL/HTTPS, control de accesos, registro de actividad, backups y actualizaciones. Ante una brecha notificamos a la SPDP en máximo 5 días y a ti en 2 días si hay riesgo significativo.",
	},
	{
		title: "Cookies",
		body: "Usamos cookies técnicas (necesarias), de análisis y de terceros (Google Maps, Sentry). Verás un banner para aceptar, rechazar o configurar por categoría. Las no esenciales no se cargan hasta tu consentimiento (Art. 8 LOPDP). Puedes gestionarlas en tu navegador.",
	},
	{
		title: "Cambios y contacto",
		body: "Podemos actualizar esta política; publicaremos la nueva versión aquí con fecha de vigencia. Contacto: {contactEmail}. Jurisdicción: tribunales de Quito, Ecuador.",
	},
];

function PrivacyPage() {
	const contactEmail = useConfig(
		"privacy.contact_email",
		"privacidad@role.app",
	);
	const sections = SECTIONS.map((s) => ({
		...s,
		body: s.body.replace("{contactEmail}", contactEmail),
	}));
	const updatedRaw = useConfig("legal.privacy_updated_at", "");
	const updatedDate = updatedRaw
		? new Date(updatedRaw).toLocaleDateString("es-MX", {
				year: "numeric",
				month: "long",
				day: "numeric",
			})
		: new Date().toLocaleDateString("es-MX", {
				year: "numeric",
				month: "long",
				day: "numeric",
			});

	return (
		<div className="min-h-screen">
			<Navbar />
			<main id="main">
				<section
					data-hero
					className="relative overflow-hidden bg-role-dark-bg px-6 pt-36 pb-16 text-white md:pt-44 md:pb-20"
				>
					<HeroBackground />
					<div className="relative mx-auto max-w-6xl">
						<div className="max-w-3xl">
							<div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 backdrop-blur-sm reveal">
								<ShieldIcon className="h-3.5 w-3.5 text-white/80" />
								<span className="text-xs font-semibold tracking-widest text-white/80 uppercase">
									Legal · Privacidad
								</span>
							</div>
							<h1 className="mt-6 font-display text-4xl font-medium tracking-[-0.03em] text-white sm:text-5xl md:text-[52px]">
								Política de{" "}
								<span className="font-display italic font-normal text-role-secondary">
									privacidad
								</span>
							</h1>
							<p className="mt-4 max-w-xl text-lg leading-relaxed text-white/70 reveal reveal-delay-1">
								Transparencia total sobre qué datos recopilamos, cómo los usamos
								y qué control tienes. Sin letra pequeña.
							</p>
							<div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white/80 backdrop-blur-sm reveal reveal-delay-2">
								<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
								Última actualización: {updatedDate}
							</div>
						</div>
					</div>
				</section>

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
							{ t: "Cifrado total", d: "Tránsito y reposo protegidos" },
							{ t: "Sin venta", d: "Nunca vendemos tus datos" },
							{ t: "Control tuyo", d: "Elimina o exporta cuando quieras" },
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
