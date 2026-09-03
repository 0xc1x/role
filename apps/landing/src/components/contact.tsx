import {
	CONTACT_CITIES_FALLBACK,
	getConfigStringArray,
} from "@0xc1x/role-commons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Eyebrow, Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { apiPost } from "@/lib/api";
import { appConfigQueryOptions } from "@/lib/queries";
import { cn } from "@/lib/utils";

type WaitlistRole = "negocio" | "persona";

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

const LS_LAST = "role-waitlist-last";

export function Contact() {
	const [role, setRole] = useState<WaitlistRole>("negocio");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [city, setCity] = useState("Quito");
	const [cityOther, setCityOther] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState<string | null>(null);

	const { data: configMap } = useQuery(appConfigQueryOptions);
	const cities = getConfigStringArray(
		configMap as Record<string, unknown> | undefined,
		"contact.cities",
		CONTACT_CITIES_FALLBACK,
	);

	const mutation = useMutation({
		mutationFn: (payload: {
			name: string;
			email: string;
			role: WaitlistRole;
			city: string;
			city_other?: string;
		}) => apiPost<{ ok: boolean }>("/contact", payload),
	});

	useEffect(() => {
		const e = localStorage.getItem(LS_LAST);
		if (e) setDone(e);
	}, []);

	useEffect(() => {
		if (!cities.includes(city)) setCity(cities[0] ?? "Quito");
	}, [cities, city]);

	useEffect(() => {
		const onRole = (e: Event) => {
			const next = (e as CustomEvent<WaitlistRole>).detail;
			if (next === "persona" || next === "negocio") setRole(next);
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
		if (city === "Otra" && !cityOther.trim()) {
			setError("Indica la ciudad.");
			return;
		}
		if (!cities.includes(city)) {
			setError("Ciudad no habilitada.");
			return;
		}
		mutation.mutate(
			{
				name: name.trim(),
				email: trimmed,
				role,
				city,
				...(city === "Otra" ? { city_other: cityOther.trim() } : {}),
			},
			{
				onSuccess: () => {
					localStorage.setItem(LS_LAST, trimmed);
					setDone(trimmed);
				},
				onError: (err: Error) =>
					setError(err.message || "No pudimos enviar. Intenta de nuevo."),
			},
		);
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
								Confirmamos <span className="font-medium text-ink">{done}</span>
								. El equipo de Rolé te contacta cuando haya un piloto o apertura
								cerca.
							</p>
							<Button
								type="button"
								variant="ghost"
								onClick={() => {
									setDone(null);
									setEmail("");
								}}
								className="h-11 rounded-xl bg-transparent px-5 text-ink shadow-[0_0_0_1px_rgba(18,36,26,0.14)] hover:bg-ink/5 hover:text-ink"
							>
								Usar otro correo
							</Button>
						</div>
					) : (
						<form
							onSubmit={onSubmit}
							className="flex flex-col gap-4"
							noValidate
						>
							{/* biome-ignore lint/a11y/useSemanticElements: toggle group styled as div; fieldset breaks layout */}
							<div
								className="flex rounded-2xl bg-paper-2 p-1"
								role="group"
								aria-label="Tipo de registro"
							>
								{ROLES.map((r) => (
									<Button
										key={r.id}
										type="button"
										variant="ghost"
										onClick={() => setRole(r.id)}
										className={cn(
											"h-11 flex-1 rounded-xl px-2 text-xs font-medium transition-colors duration-150 sm:text-sm",
											role === r.id
												? "bg-cream text-ink shadow-[var(--shadow-card)] hover:bg-cream"
												: "text-ink-soft hover:bg-transparent hover:text-ink-soft",
										)}
									>
										{r.label}
									</Button>
								))}
							</div>

							<div className="flex flex-col gap-1.5">
								<Label
									htmlFor="contact-name"
									className="text-sm font-medium text-ink"
								>
									Nombre
								</Label>
								<Input
									id="contact-name"
									name="name"
									autoComplete="name"
									placeholder="Tu nombre"
									value={name}
									onChange={(e) => setName(e.target.value)}
									className="h-12 w-full rounded-xl border-0 bg-cream px-4 text-base text-ink shadow-[0_0_0_1px_rgba(18,36,26,0.12)] placeholder:text-muted focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-0"
								/>
							</div>

							<div className="flex flex-col gap-1.5">
								<Label
									htmlFor="contact-email"
									className="text-sm font-medium text-ink"
								>
									Correo
								</Label>
								<Input
									id="contact-email"
									name="email"
									type="email"
									autoComplete="email"
									inputMode="email"
									required
									placeholder="tu@correo.com"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									aria-invalid={Boolean(error)}
									className="h-12 w-full rounded-xl border-0 bg-cream px-4 text-base text-ink shadow-[0_0_0_1px_rgba(18,36,26,0.12)] placeholder:text-muted focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-0"
								/>
							</div>

							<div className="flex flex-col gap-1.5">
								<Label className="text-sm font-medium text-ink">Ciudad</Label>
								<Select value={city} onValueChange={(v) => v && setCity(v)}>
									<SelectTrigger
										id="contact-city"
										className="h-12 w-full rounded-xl border-0 bg-cream px-4 text-base text-ink shadow-[0_0_0_1px_rgba(18,36,26,0.12)] data-placeholder:text-muted focus-visible:border-0 focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-0 [&_svg]:text-muted"
									>
										<SelectValue placeholder="Selecciona ciudad" />
									</SelectTrigger>
									<SelectContent className="rounded-xl border border-black/10 bg-cream shadow-[var(--shadow-card)]">
										<SelectGroup>
											{cities.map((c) => (
												<SelectItem
													key={c}
													value={c}
													className="rounded-lg text-sm text-ink focus:bg-ink/5 data-highlighted:bg-ink/5"
												>
													{c}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</div>

							{city === "Otra" ? (
								<div className="flex flex-col gap-1.5">
									<Label
										htmlFor="contact-city-other"
										className="text-sm font-medium text-ink"
									>
										¿Qué ciudad?
									</Label>
									<Input
										id="contact-city-other"
										name="city_other"
										placeholder="Escribe tu ciudad"
										value={cityOther}
										onChange={(e) => setCityOther(e.target.value)}
										className="h-12 w-full rounded-xl border-0 bg-cream px-4 text-base text-ink shadow-[0_0_0_1px_rgba(18,36,26,0.12)] placeholder:text-muted focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-0"
									/>
								</div>
							) : null}

							{error ? (
								<p className="text-sm text-danger" role="alert">
									{error}
								</p>
							) : null}

							<Button
								variant="ghost"
								type="submit"
								disabled={mutation.isPending}
								className="mt-1 h-12 w-full rounded-xl bg-forest px-6 text-sm font-medium text-cream hover:bg-forest-hover hover:text-cream active:scale-[0.98] disabled:opacity-60"
							>
								{mutation.isPending ? "Enviando…" : "Enviar"}
							</Button>
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
