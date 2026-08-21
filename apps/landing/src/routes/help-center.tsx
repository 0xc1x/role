import { createFileRoute } from "@tanstack/react-router";

import { Footer } from "@/components/footer";
import {
	ClockCheckIcon,
	MailIcon,
	MapPinIcon,
	TagIcon,
} from "@/components/icons";
import { Navbar } from "@/components/navbar";
import { useConfig } from "@/lib/use-config";

export const Route = createFileRoute("/help-center")({
	component: HelpCenterPage,
});

const CATEGORIES = [
	{
		icon: TagIcon,
		title: "Sobre las ofertas",
		items: [
			{
				q: "¿Qué contiene exactamente cada oferta?",
				a: "Cada oferta muestra el contenido aproximado, el horario de recogida y el descuento aplicado. Como se trata de excedente del día, los artículos exactos pueden variar según lo que el comercio tenga disponible, pero siempre corresponde a comida de calidad lista para consumir.",
			},
			{
				q: "¿Cuánto puedo ahorrar?",
				a: "Normalmente entre 50% y 70% del precio original. Cada oferta muestra el precio rebajado y el precio original tachado antes de que reserves.",
			},
			{
				q: "¿En qué ciudades está disponible Rolé?",
				a: "Estamos expandiéndonos constantemente. Abre la app para ver los comercios disponibles cerca de ti. Si no hay comercios en tu zona aún, puedes activar alertas para enterarte cuando lleguemos.",
			},
		],
	},
	{
		icon: ClockCheckIcon,
		title: "Reservas y recogida",
		items: [
			{
				q: "¿Tengo que pagar antes de recoger?",
				a: "No. La reserva es gratuita y solo confirma tu lugar. Pagas directamente en el comercio al momento de recoger tu comida.",
			},
			{
				q: "¿Qué pasa si no llego a tiempo?",
				a: "Tu reserva se libera automáticamente al terminar el horario de recogida para que otro usuario pueda aprovecharla. Puedes cancelar sin costo desde la pestaña de pedidos antes de que empiece el horario.",
			},
			{
				q: "¿Puedo elegir qué comida recibo?",
				a: "El contenido de cada bolsa lo define el comercio según su excedente del día. No es posible seleccionar artículos individuales, pero la oferta siempre describe el tipo de comida incluida.",
			},
		],
	},
	{
		icon: MapPinIcon,
		title: "Cuenta y pagos",
		items: [
			{
				q: "¿Cómo cancelo una reserva?",
				a: "Ve a la pestaña de pedidos en la app, selecciona la reserva y pulsa cancelar. No hay cargos por cancelar ya que el pago se realiza en el comercio.",
			},
			{
				q: "¿Cómo pago mi comida?",
				a: "El pago se hace directamente en el comercio al recoger. Rolé no procesa pagos: tú pagas al comercio con el método que acepten (efectivo, tarjeta, transferencia).",
			},
			{
				q: "¿Cómo gestiono mis datos?",
				a: "Desde tu perfil en la app puedes actualizar tu información, gestionar preferencias de notificaciones y eliminar tu cuenta cuando quieras. Consulta nuestra política de privacidad para más detalle.",
			},
		],
	},
];

function useContactOptions() {
	const holaEmail = useConfig("contact.hola_email", "hola@role.app");
	const negociosEmail = useConfig(
		"contact.negocios_email",
		"negocios@role.app",
	);
	return [
		{
			icon: MailIcon,
			title: "Soporte general",
			description: "Dudas sobre reservas, la app o tu cuenta.",
			contact: holaEmail,
			href: `mailto:${holaEmail}`,
		},
		{
			icon: MailIcon,
			title: "Para negocios",
			description: "Consultas comerciales y registro de comercios.",
			contact: negociosEmail,
			href: `mailto:${negociosEmail}`,
		},
	];
}

function HelpCenterPage() {
	const contactOptions = useContactOptions();
	const slaHours = useConfig("support.sla_hours", "24");
	return (
		<div className="min-h-screen">
			<Navbar />
			<main id="main">
				{/* Hero */}
				<section
					data-hero
					className="relative overflow-hidden bg-role-dark-bg px-6 pt-36 pb-24 text-white md:pt-44 md:pb-32"
				>
					<div aria-hidden className="pointer-events-none absolute inset-0">
						<div className="absolute inset-0 bg-gradient-to-br from-role-dark-bg via-role-dark-bg to-role-primary-deep/25" />
						<div className="absolute -top-32 left-1/4 h-96 w-96 animate-drift rounded-full bg-role-primary/15 blur-3xl" />
						<div className="absolute bottom-0 right-1/4 h-72 w-72 animate-drift-slow rounded-full bg-role-primary-deep/25 blur-3xl" />
						<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_42%,_rgb(26_22_20)_100%)]" />
					</div>
					<div className="relative mx-auto max-w-4xl">
						<p className="text-sm font-semibold uppercase tracking-widest text-role-secondary reveal">
							Ayuda
						</p>
						<h1 className="mt-4 font-heading text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl reveal reveal-delay-1">
							Centro de ayuda
						</h1>
						<p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75 reveal reveal-delay-2">
							Encuentra respuestas a las preguntas más comunes, organizadas por
							categoría. Si no encuentras lo que buscas, escríbenos.
						</p>
					</div>
				</section>

				{/* FAQ by category */}
				<section className="mx-auto max-w-3xl px-6 py-24 md:py-32">
					<div className="space-y-16">
						{CATEGORIES.map((cat, catIdx) => {
							const Icon = cat.icon;
							return (
								<div
									key={cat.title}
									className={`reveal reveal-delay-${catIdx + 1}`}
								>
									<div className="mb-6 flex items-center gap-3">
										<div className="flex h-11 w-11 items-center justify-center rounded-xl bg-role-primary-soft text-role-primary">
											<Icon className="h-5 w-5" />
										</div>
										<h2 className="font-heading text-xl font-bold tracking-tight">
											{cat.title}
										</h2>
									</div>
									<div className="space-y-3">
										{cat.items.map((item) => (
											<details
												key={item.q}
												className="group overflow-hidden rounded-[var(--radius-card)] border border-role-border bg-white transition-all duration-300 hover:shadow-soft [&_summary::-webkit-details-marker]:hidden"
											>
												<summary className="flex cursor-pointer select-none items-center justify-between gap-4 px-6 py-5">
													<span className="font-heading text-base font-bold text-role-foreground transition-colors group-hover:text-role-primary">
														{item.q}
													</span>
													<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-role-muted text-role-primary transition-transform duration-200 group-open:rotate-180">
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
															<path d="m6 9 6 6 6-6" />
														</svg>
													</span>
												</summary>
												<div className="px-6 pb-5 pt-0">
													<p className="max-w-2xl leading-relaxed text-role-muted-foreground">
														{item.a}
													</p>
												</div>
											</details>
										))}
									</div>
								</div>
							);
						})}
					</div>
				</section>

				{/* Contact cards */}
				<section className="bg-role-surface-muted px-6 py-24 md:py-32">
					<div className="mx-auto max-w-3xl">
						<div className="mb-12 text-center reveal">
							<p className="text-sm font-semibold uppercase tracking-widest text-role-primary">
								¿Aún necesitas ayuda?
							</p>
							<h2 className="mt-3 font-heading text-3xl font-bold tracking-tight md:text-4xl">
								Habla con nosotros
							</h2>
							<p className="mx-auto mt-4 max-w-md text-lg text-role-muted-foreground">
								Respondemos en menos de {slaHours} horas entre semana.
							</p>
						</div>
						<div className="grid gap-5 sm:grid-cols-2">
							{contactOptions.map((c, i) => {
								const Icon = c.icon;
								return (
									<a
										key={c.title}
										href={c.href}
										className={`group flex flex-col rounded-[var(--radius-card)] border border-role-border/50 bg-white p-7 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-role-primary/30 hover:shadow-raised reveal reveal-delay-${i + 1}`}
									>
										<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-role-primary-soft text-role-primary transition-colors duration-300 group-hover:bg-role-primary group-hover:text-white">
											<Icon className="h-6 w-6" />
										</div>
										<h3 className="mt-6 font-heading text-lg font-bold">
											{c.title}
										</h3>
										<p className="mt-2 flex-1 text-sm leading-relaxed text-role-muted-foreground">
											{c.description}
										</p>
										<p className="mt-4 font-semibold text-role-primary">
											{c.contact}
										</p>
									</a>
								);
							})}
						</div>
					</div>
				</section>
			</main>
			<Footer />
		</div>
	);
}
