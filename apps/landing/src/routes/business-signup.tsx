import {
	OnboardingBusinessRequestSchema,
	OnboardingBusinessResponseSchema,
} from "@0xc1x/role-commons";
import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";

import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiPost } from "@/lib/api";
import { pageHead } from "@/lib/seo";
import { useStoreLink } from "@/lib/store-links";

/**
 * Borrador del formulario. `sessionStorage` y no `localStorage` a propósito: el
 * borrador muere con la pestaña, que es exactamente el alcance del problema
 * (recargar o cambiar de pestaña). NUNCA la contraseña: `sessionStorage` es
 * legible por cualquier script del origen y sobrevive a un XSS en la página.
 */
const DRAFT_KEY = "role-business-signup-draft";

interface SignupDraft {
	fullName: string;
	email: string;
	businessName: string;
	phone: string;
}

const EMPTY_DRAFT: SignupDraft = {
	fullName: "",
	email: "",
	businessName: "",
	phone: "",
};

/**
 * 409 = el correo ya existe. El backend responde `ConflictException('Email is
 * already registered')`; mostrar eso crudo es un error en inglés dentro de un
 * formulario en español, y además no le dice al usuario qué hacer. Rolé no tiene
 * ruta de login propia: la cuenta vive en la app, así que el mensaje manda ahí.
 */
const CONFLICT_MESSAGE = "Ya existe una cuenta con este correo.";
const CONFLICT_HINT =
	"Puede que ya te hayas registrado antes. Inicia sesión en la app de Rolé con ese correo para administrar tu negocio.";

function readDraft(): SignupDraft {
	if (typeof window === "undefined") return EMPTY_DRAFT;
	try {
		const raw = window.sessionStorage.getItem(DRAFT_KEY);
		if (!raw) return EMPTY_DRAFT;
		const parsed = JSON.parse(raw) as Partial<SignupDraft>;
		return {
			fullName: typeof parsed.fullName === "string" ? parsed.fullName : "",
			email: typeof parsed.email === "string" ? parsed.email : "",
			businessName:
				typeof parsed.businessName === "string" ? parsed.businessName : "",
			phone: typeof parsed.phone === "string" ? parsed.phone : "",
		};
	} catch {
		// Un borrador corrupto no puede impedir cargar el formulario.
		return EMPTY_DRAFT;
	}
}

function clearDraft() {
	if (typeof window === "undefined") return;
	try {
		window.sessionStorage.removeItem(DRAFT_KEY);
	} catch {
		// Modo privado / cuota negada: el formulario funciona igual.
	}
}

export const Route = createFileRoute("/business-signup")({
	head: () => {
		const base = pageHead(
			"/business-signup",
			"Registra tu negocio | Rolé",
			"Únete a Rolé: publica tu comida excedente, recupera ingresos y consigue nuevos clientes.",
		);
		return {
			...base,
			meta: [...base.meta, { name: "robots", content: "noindex, nofollow" }],
		};
	},
	component: BusinessSignupPage,
});

function BusinessSignupPage() {
	// El borrador se restaura en un efecto y NO en el inicializador de useState:
	// esta ruta se renderiza en el servidor, y un inicializador que leyera
	// sessionStorage en el cliente haría que el primer render hidratara con los
	// campos llenos contra un HTML servidor con los campos vacíos. Eso es un
	// hydration mismatch. `restored` evita que el efecto de guardado borre el
	// borrador antes de haberlo leído.
	const [draft, setDraft] = useState<SignupDraft>(EMPTY_DRAFT);
	const [restored, setRestored] = useState(false);
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [loading, setLoading] = useState(false);
	const [done, setDone] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// El 409 tiene su propio bloque: no es solo un string, necesita el enlace a
	// iniciar sesión. El login real vive en la app, no en el sitio.
	const [conflict, setConflict] = useState(false);
	const signInLink = useStoreLink();

	const { fullName, email, businessName, phone } = draft;

	function update(patch: Partial<SignupDraft>) {
		setDraft((prev) => ({ ...prev, ...patch }));
	}

	useEffect(() => {
		setDraft(readDraft());
		setRestored(true);
	}, []);

	// Se guarda en cada cambio, no en `onSubmit`: el borrador existe para el
	// usuario que NO llegó a enviar.
	useEffect(() => {
		if (!restored) return;
		const isEmpty = Object.values(draft).every((v) => v === "");
		try {
			if (isEmpty) window.sessionStorage.removeItem(DRAFT_KEY);
			else window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
		} catch {
			// Sin storage el formulario sigue siendo usable.
		}
	}, [draft, restored]);

	const submit = async (e: FormEvent) => {
		e.preventDefault();
		setConflict(false);
		if (password !== confirm) {
			setError("Las contraseñas no coinciden");
			return;
		}
		// Mismo contrato que valida el backend (SSOT): el error del server
		// también se muestra, pero así el feedback es inmediato y en español.
		const parsed = OnboardingBusinessRequestSchema.safeParse({
			email: email.trim(),
			password,
			full_name: fullName.trim(),
			business_name: businessName.trim(),
			phone: phone.trim() || null,
		});
		if (!parsed.success) {
			// Zod no sabe de español: mapeamos por campo para dar feedback claro.
			const field = String(parsed.error.issues[0]?.path[0] ?? "");
			const messages: Record<string, string> = {
				email: "Ingresa un email válido",
				password: "La contraseña debe tener al menos 8 caracteres",
				full_name: "Ingresa tu nombre completo",
				business_name: "Ingresa el nombre del negocio",
			};
			setError(messages[field] ?? "Completa todos los campos correctamente");
			return;
		}
		setLoading(true);
		setError(null);
		try {
			const raw = await apiPost<unknown>("/businesses/onboarding", parsed.data);
			OnboardingBusinessResponseSchema.parse(raw);
			// El borrador se borra solo al confirmar, no al enviar: si la API
			// falla, los datos que el usuario escribió siguen ahí.
			clearDraft();
			setDone(true);
		} catch (err) {
			if (err instanceof ApiError && err.isConflict) {
				setError(CONFLICT_MESSAGE);
				setConflict(true);
			} else {
				setError(err instanceof Error ? err.message : "Error al registrar");
			}
		} finally {
			setLoading(false);
		}
	};

	if (done) {
		return (
			<div className="min-h-screen">
				<Navbar />
				<main
					id="main"
					className="mx-auto max-w-xl px-6 pt-36 pb-24 text-center"
				>
					<h1 className="font-heading text-3xl font-bold">
						¡Recibimos tu solicitud!
					</h1>
					<p className="mt-4 text-role-muted-foreground">
						Tu negocio está en revisión. Te contactaremos en menos de 24 horas
						para activarlo. Revisa tu correo para confirmar tu cuenta si es
						necesario.
					</p>
					<Link
						to="/"
						className="mt-8 inline-block rounded-full bg-role-primary px-6 py-3 font-semibold text-white"
					>
						Volver al inicio
					</Link>
				</main>
				<Footer />
			</div>
		);
	}

	return (
		<div className="min-h-screen">
			<Navbar />
			<main id="main" className="mx-auto max-w-xl px-6 pt-32 pb-24">
				<h1 className="font-heading text-3xl font-bold">
					Registrar mi negocio
				</h1>
				<p className="mt-2 text-role-muted-foreground">
					Crea tu cuenta y tu negocio en un solo paso. Quedará en estado
					pendiente hasta verificación.
				</p>
				<form onSubmit={submit} className="mt-8 space-y-4">
					<div>
						<Label htmlFor="signup-name">Tu nombre *</Label>
						<Input
							id="signup-name"
							value={fullName}
							onChange={(e) => update({ fullName: e.target.value })}
							placeholder="Nombre completo"
							required
						/>
					</div>
					<div>
						<Label htmlFor="signup-email">Email *</Label>
						<Input
							id="signup-email"
							type="email"
							value={email}
							onChange={(e) => update({ email: e.target.value })}
							placeholder="tu@email.com"
							required
						/>
					</div>
					<div>
						<Label htmlFor="signup-password">Contraseña *</Label>
						<Input
							id="signup-password"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
						/>
					</div>
					<div>
						<Label htmlFor="signup-confirm">Confirmar contraseña *</Label>
						<Input
							id="signup-confirm"
							type="password"
							value={confirm}
							onChange={(e) => setConfirm(e.target.value)}
							required
						/>
					</div>
					<div>
						<Label htmlFor="signup-business">Nombre del negocio *</Label>
						<Input
							id="signup-business"
							value={businessName}
							onChange={(e) => update({ businessName: e.target.value })}
							placeholder="Panadería La Espiga"
							required
						/>
					</div>
					<div>
						<Label htmlFor="signup-phone">Teléfono</Label>
						<Input
							id="signup-phone"
							value={phone}
							onChange={(e) => update({ phone: e.target.value })}
							placeholder="+593 ..."
						/>
					</div>
					{error ? (
						<p
							role="alert"
							aria-live="polite"
							className="text-sm text-destructive"
						>
							{error}
						</p>
					) : null}
					{conflict ? (
						<p className="text-sm text-role-muted-foreground">
							{CONFLICT_HINT}{" "}
							<a
								href={signInLink}
								className="font-semibold text-role-primary underline underline-offset-2"
							>
								Iniciar sesión en la app de Rolé
							</a>
						</p>
					) : null}
					<Button
						type="submit"
						disabled={loading}
						className="w-full rounded-full"
					>
						{loading ? "Registrando..." : "Registrar negocio"}
					</Button>
					<p className="text-xs text-role-muted-foreground text-center">
						Al registrar, tu negocio quedará en <b>pendiente</b> y no será
						visible hasta ser aprobado desde el admin. Recibirás un email para
						confirmar tu cuenta y el equipo de Rolé te contactará.
					</p>
					{/* Consentimiento en el momento en que se crea la cuenta y la
					    contraseña. El footer tiene los enlaces, pero el footer no es
					    el lugar donde se decide si crear una cuenta. */}
					<p className="text-xs leading-relaxed text-role-muted-foreground text-center">
						Al registrar tu negocio creas una cuenta de Rolé y aceptas los{" "}
						<Link
							to="/terms"
							className="underline underline-offset-2 hover:text-ink"
						>
							términos y condiciones
						</Link>{" "}
						y la{" "}
						<Link
							to="/privacy"
							className="underline underline-offset-2 hover:text-ink"
						>
							política de privacidad
						</Link>
						.
					</p>
				</form>
			</main>
			<Footer />
		</div>
	);
}
