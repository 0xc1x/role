import {
	OnboardingBusinessRequestSchema,
	type OnboardingBusinessResponse,
} from "@0xc1x/role-commons";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/business-signup")({
	head: () =>
		pageHead(
			"/business-signup",
			"Registra tu negocio | Rolé",
			"Únete a Rolé: publica tu comida excedente, recupera ingresos y consigue nuevos clientes.",
		),
	component: BusinessSignupPage,
});

function BusinessSignupPage() {
	const [fullName, setFullName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [businessName, setBusinessName] = useState("");
	const [phone, setPhone] = useState("");
	const [loading, setLoading] = useState(false);
	const [done, setDone] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
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
			await apiPost<OnboardingBusinessResponse>(
				"/businesses/onboarding",
				parsed.data,
			);
			setDone(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Error al registrar");
		} finally {
			setLoading(false);
		}
	};

	if (done) {
		return (
			<div className="min-h-screen">
				<Navbar />
				<main className="mx-auto max-w-xl px-6 pt-36 pb-24 text-center">
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
			<main className="mx-auto max-w-xl px-6 pt-32 pb-24">
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
							onChange={(e) => setFullName(e.target.value)}
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
							onChange={(e) => setEmail(e.target.value)}
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
							onChange={(e) => setBusinessName(e.target.value)}
							placeholder="Panadería La Espiga"
							required
						/>
					</div>
					<div>
						<Label htmlFor="signup-phone">Teléfono</Label>
						<Input
							id="signup-phone"
							value={phone}
							onChange={(e) => setPhone(e.target.value)}
							placeholder="+593 ..."
						/>
					</div>
					{error ? <p className="text-sm text-destructive">{error}</p> : null}
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
				</form>
			</main>
			<Footer />
		</div>
	);
}
