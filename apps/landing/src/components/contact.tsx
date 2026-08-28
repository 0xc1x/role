import { type FormEvent, useEffect, useState } from "react";
import { Check } from "lucide-react";

import { Eyebrow, Section } from "@/components/section";
import { cn } from "@/lib/utils";

type WaitlistRole = "negocio" | "persona";

const CITIES = ["Quito", "Guayaquil", "Cuenca", "Manta", "Otra"];

const ROLES: { id: WaitlistRole; label: string }[] = [
	{ id: "negocio", label: "Tengo un local" },
	{ id: "persona", label: "Quiero Rolé" },
];

const COPY: Record<WaitlistRole, { title: string; body: string }> = {
	negocio: {
		title: "Pon tu local en el primer piloto de tu zona.",
		body: "Te escribimos para armar el onboarding de Rolé. Sin newsletters semanales.",
	},
	persona: {
		title: "Rolé es el producto para rescatar comida.",
		body: "Te avisamos cuando abra en tu ciudad. Sin spam, solo apertura.",
	},
};

function isEmail(v: string) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// ponytail: localStorage only, no server sync — migrate to API when waitlist needs persistence/search
const LS_KEY = "role-waitlist";
const LS_LAST = "role-waitlist-last";

function readLeads(): { email: string }[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = localStorage.getItem(LS_KEY);
		if (!raw) return [];
		const p = JSON.parse(raw);
		return Array.isArray(p) ? p : [];
	} catch {
		return [];
	}
}

export function Contact() {
	const [role, setRole] = useState<WaitlistRole>("negocio");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [city, setCity] = useState("Quito");
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState<string | null>(null);

	useEffect(() => {
		const e = localStorage.getItem(LS_LAST);
		if (e) setDone(e);
	}, []);

	useEffect(() => {
		const onRole = (e: Event) => {
			const next = (e as CustomEvent<WaitlistRole>).detail;
			if (next === "persona" || next === "negocio")
				setRole(next);
		};
		window.addEventListener("fudi:role", onRole);
		return () => window.removeEventListener("fudi:role", onRole);
	}, []);

	function onSubmit(e: FormEvent) {
		e.preventDefault();
		setError(null);
		const trimmed = email.trim().toLowerCase();
		if (!isEmail(trimmed)) {
			setError("Ingresa un correo válido.");
			return;
		}
		const lead = {
			email: trimmed,
			name: name.trim(),
			role,
			city,
			product: "role" as const,
			at: new Date().toISOString(),
		};
		const leads = readLeads().filter((l) => l.email !== trimmed);
		localStorage.setItem(LS_KEY, JSON.stringify([...leads, lead]));
		localStorage.setItem(LS_LAST, trimmed);
		setDone(trimmed);
	}

	const copy = COPY[role];

	return (
		<Section id="contacto" tone="forest" className="py-24 md:py-32">
			<div className="grid items-start gap-12 lg:grid-cols-[1fr_1fr]">
				<div className="reveal">
					<Eyebrow className="text-cream/70">Hablemos</Eyebrow>
					<h2 className="font-display text-3xl font-medium tracking-[-0.03em] text-cream sm:text-4xl md:text-5xl">
						{copy.title}
					</h2>
					<p className="mt-4 max-w-md text-base leading-relaxed text-cream/80">
						{copy.body}
					</p>
				</div>

				<div className="rounded-3xl bg-cream p-6 text-ink shadow-[var(--shadow-card)] md:p-8 reveal reveal-delay-1">
					{done ? (
						<div className="flex flex-col items-start gap-4 py-4">
							<span className="flex size-12 items-center justify-center rounded-2xl bg-leaf text-forest">
								<Check className="size-6" strokeWidth={2} />
							</span>
							<h3 className="font-display text-2xl font-medium tracking-tight">
								Te escribimos.
							</h3>
							<p className="text-sm leading-relaxed text-ink-soft">
								Confirmamos <span className="font-medium text-ink">{done}</span>.
								El equipo de Rolé te contacta cuando haya un piloto o apertura
								cerca.
							</p>
							<button
								type="button"
								onClick={() => {
									setDone(null);
									setEmail("");
								}}
								className="inline-flex h-11 items-center justify-center rounded-xl bg-transparent px-5 text-sm font-medium text-ink shadow-[0_0_0_1px_rgba(18,36,26,0.14)] hover:bg-ink/5"
							>
								Usar otro correo
							</button>
						</div>
					) : (
						<form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
							<div
								className="flex rounded-2xl bg-paper-2 p-1"
								role="group"
								aria-label="Tipo de registro"
							>
								{ROLES.map((r) => (
									<button
										key={r.id}
										type="button"
										onClick={() => setRole(r.id)}
										className={cn(
											"h-11 flex-1 rounded-xl px-2 text-xs font-medium  transition-colors duration-150 sm:text-sm",
											role === r.id
												? "bg-cream text-ink shadow-[var(--shadow-card)]"
												: "text-ink-soft",
										)}
									>
										{r.label}
									</button>
								))}
							</div>

							<label className="flex flex-col gap-1.5">
								<span className="text-sm font-medium">Nombre</span>
								<input
									name="name"
									autoComplete="name"
									placeholder="Tu nombre"
									value={name}
									onChange={(e) => setName(e.target.value)}
									className="h-12 w-full rounded-xl bg-cream px-4 text-base text-ink shadow-[0_0_0_1px_rgba(18,36,26,0.12)] outline-none placeholder:text-muted focus-visible:shadow-[0_0_0_2px_var(--color-forest)]"
								/>
							</label>

							<label className="flex flex-col gap-1.5">
								<span className="text-sm font-medium">Correo</span>
								<input
									name="email"
									type="email"
									autoComplete="email"
									inputMode="email"
									required
									placeholder="tu@correo.com"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									aria-invalid={Boolean(error)}
									className="h-12 w-full rounded-xl bg-cream px-4 text-base text-ink shadow-[0_0_0_1px_rgba(18,36,26,0.12)] outline-none placeholder:text-muted focus-visible:shadow-[0_0_0_2px_var(--color-forest)]"
								/>
							</label>

							<label className="flex flex-col gap-1.5">
								<span className="text-sm font-medium">Ciudad</span>
								<select
									name="city"
									value={city}
									onChange={(e) => setCity(e.target.value)}
									className="h-12 w-full rounded-xl bg-cream px-4 text-base text-ink shadow-[0_0_0_1px_rgba(18,36,26,0.12)] outline-none focus-visible:shadow-[0_0_0_2px_var(--color-forest)]"
								>
									{CITIES.map((c) => (
										<option key={c} value={c}>
											{c}
										</option>
									))}
								</select>
							</label>

							{error ? (
								<p className="text-sm text-danger" role="alert">
									{error}
								</p>
							) : null}

							<button
								type="submit"
								className="mt-1 inline-flex h-12 w-full items-center justify-center rounded-xl bg-forest px-6 text-sm font-medium text-cream hover:bg-forest-hover active:scale-[0.98]"
							>
								Enviar
							</button>
							<p className="text-xs leading-relaxed text-muted">
								Al enviar aceptas que Rolé te contacte sobre productos y
								pilotos. Puedes salir cuando quieras.
							</p>
						</form>
					)}
				</div>
			</div>
		</Section>
	);
}
