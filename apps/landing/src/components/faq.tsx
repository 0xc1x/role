import { useState } from "react";

import { useConfig } from "@/lib/use-config";

const FAQS = [
	{
		q: "¿Qué es Rolé?",
		a: "Rolé es una plataforma que conecta comercios con excedente de comida con personas que quieren ahorrar dinero mientras ayudan al planeta. Los comercios ofrecen excedentes del día a precios reducidos.",
	},
	{
		q: "¿Cómo funciona el sistema de reservas?",
		a: "Explora los comercios disponibles cerca de ti, selecciona la oferta que quieras, confirma en la app y recoge tu pedido en el horario indicado. Todo el proceso toma menos de 2 minutos.",
	},
	{
		q: "¿Cuánto puedo ahorrar?",
		a: "Normalmente ahorrarás entre un 50% y 70% del precio original. Cada oferta muestra su descuento antes de reservar.",
	},
	{
		q: "¿En qué ciudades está disponible Rolé?",
		a: "Estamos expandiéndonos constantemente. Consulta la app para ver los comercios disponibles cerca de ti.",
	},
	{
		q: "¿Cómo me registro como comercio?",
		a: "Registra tu comercio desde la sección “Para negocios” o desde la propia app. Te guiaremos en todo el proceso de configuración.",
	},
];

export function Faq() {
	const holaEmail = useConfig("contact.hola_email", "hola@role.app");
	const [openIndex, setOpenIndex] = useState<number | null>(null);

	return (
		<section className="mx-auto max-w-3xl px-6 pb-32 pt-24">
			<div className="text-center reveal">
				<p className="text-sm font-semibold uppercase tracking-widest text-role-primary">
					Preguntas frecuentes
				</p>
				<h2 className="mt-3 font-heading text-3xl font-bold tracking-tight md:text-5xl">
					Siempre hay dudas. Aquí respondemos.
				</h2>
				<p className="mt-4 max-w-md mx-auto leading-relaxed text-role-muted-foreground">
					Lo que más nos preguntan antes de la primera reserva, respondido claro
					y directo.
				</p>
			</div>
			<div className="mt-12 space-y-3">
				{FAQS.map((f, i) => (
					<details
						key={f.q}
						className="group overflow-hidden rounded-[var(--radius-card)] border border-role-border bg-white transition-all duration-300 [&_summary::-webkit-details-marker]:hidden"
						open={openIndex === i}
						onToggle={() => setOpenIndex((prev) => (prev === i ? null : i))}
					>
						<summary className="flex cursor-pointer select-none items-center justify-between gap-4 px-6 py-5">
							<span className="font-heading text-base font-bold text-role-foreground transition-colors group-hover:text-role-primary">
								{f.q}
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
						<div className="px-6 pb-5 pt-0 overflow-hidden transition-all duration-300">
							<p className="max-w-2xl leading-relaxed text-role-muted-foreground">
								{f.a}
							</p>
						</div>
					</details>
				))}
			</div>
			<div className="mt-10 rounded-[var(--radius-card)] bg-role-muted p-7 text-center reveal">
				<h3 className="font-heading text-lg font-bold">
					Tu pregunta no está aquí
				</h3>
				<p className="mt-2 text-sm leading-relaxed text-role-muted-foreground">
					Escríbenos a{" "}
					<a
						href={`mailto:${holaEmail}`}
						className="font-semibold text-role-primary underline decoration-role-primary/30 underline-offset-4 transition-colors hover:decoration-role-primary"
					>
						hola@role.app
					</a>{" "}
					y te respondemos en menos de 24 horas.
				</p>
			</div>
		</section>
	);
}
