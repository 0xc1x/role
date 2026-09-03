import { createFileRoute } from "@tanstack/react-router";

import { Footer } from "@/components/footer";
import { HeroBackground } from "@/components/hero-background";
import { ShieldIcon } from "@/components/icons";
import { Navbar } from "@/components/navbar";
import { Eyebrow } from "@/components/section";
import { useConfig } from "@/lib/use-config";

export const Route = createFileRoute("/terms")({
	component: TermsPage,
});

const SECTIONS = [
	{
		title: "Aceptación y objeto",
		body: "Estos Términos regulan el uso de Rolé (app y web) operado por 0xC1X S.A.S., RUC 1799999999001, Quito, Ecuador. Al crear cuenta o usar el servicio aceptas estos términos. Si no estás de acuerdo, no uses la plataforma.",
	},
	{
		title: "El servicio e intermediación",
		body: "Rolé es una plataforma tecnológica que intermedia entre comercios con excedente y usuarios. No produce, comercializa ni transporta alimentos; no es empleador de comercios o repartidores. Las ofertas son publicadas por los comercios y su contenido puede variar.",
	},
	{
		title: "Registro y cuenta",
		body: "El registro es gratuito y requiere datos veraces. Eres responsable de tu contraseña y de la actividad en tu cuenta. Cuenta personal, única e intransferible. Podemos suspender cuentas con datos falsos o uso indebido.",
	},
	{
		title: "Reservas, pagos y recogida",
		body: "La reserva en la app confirma tu lugar; el pago se realiza directamente en el comercio al recoger (pickup-only). No cobramos en la app en esta fase. Acude en el horario indicado con tu código de reserva.",
	},
	{
		title: "Cancelaciones y no show",
		body: "Puedes cancelar sin costo antes del cierre de la ventana de recogida. Las reservas no recogidas se liberan y afectan tu historial; no hay reembolso si ya pagaste en el comercio (aplica criterio del comercio).",
	},
	{
		title: "Obligaciones del usuario",
		body: "Usar la plataforma de forma diligente, respetar horarios, no revender, no crear cuentas duplicadas y no interferir con el servicio. El incumplimiento puede implicar suspensión.",
	},
	{
		title: "Obligaciones del comercio y exoneración",
		body: "El comercio responde por la calidad, seguridad, legalidad y etiquetado de sus productos. Rolé, como intermediario tecnológico, no asume responsabilidad por falta de disponibilidad, calidad o efectos del consumo, sin perjuicio de mediar ante reclamos.",
	},
	{
		title: "Propiedad intelectual y uso",
		body: "Textos, marcas, logos y diseño son de Rolé o licenciados. No puedes copiar, extraer o usar el contenido sin autorización. El uso indebido habilita baja y acciones legales.",
	},
	{
		title: "Cambios, ley y contacto",
		body: "Podemos actualizar estos términos y notificar cambios relevantes en la app/web. Se rigen por leyes de la República del Ecuador, jurisdicción tribunales de Quito. Contacto legal: {contactEmail}.",
	},
];

function TermsPage() {
	const contactEmail = useConfig("legal.contact_email", "legal@role.app");
	const sections = SECTIONS.map((s) => ({
		...s,
		body: s.body.replace("{contactEmail}", contactEmail),
	}));
	const updatedRaw = useConfig("legal.terms_updated_at", "");
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
									Legal · Términos
								</span>
							</div>
							<h1 className="mt-6 font-display text-4xl font-medium tracking-[-0.03em] text-white sm:text-5xl md:text-[52px]">
								Términos y{" "}
								<span className="font-display italic font-normal text-role-secondary">
									condiciones
								</span>
							</h1>
							<p className="mt-4 max-w-xl text-lg leading-relaxed text-white/70 reveal reveal-delay-1">
								Reglas claras para una comunidad justa. Qué esperamos de ti y
								qué puedes esperar de Rolé.
							</p>
							<div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white/80 backdrop-blur-sm reveal reveal-delay-2">
								<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
								Última actualización: {updatedDate}
							</div>
						</div>
					</div>
				</section>

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
