import { CONTACT_CITIES_FALLBACK, getConfigStringArray } from "@0xc1x/role-commons";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
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
import { apiUrl } from "@/lib/api";
import { appConfigQueryOptions } from "@/lib/queries";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/business-signup")({
	component: BusinessSignupPage,
});

function BusinessSignupPage() {
	const [fullName, setFullName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [businessName, setBusinessName] = useState("");
	const [phone, setPhone] = useState("");
	const [city, setCity] = useState("");
	const [cityOther, setCityOther] = useState("");
	const [loading, setLoading] = useState(false);
	const [done, setDone] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const { data: configMap } = useQuery(appConfigQueryOptions);
	const cities = getConfigStringArray(
		configMap,
		"contact.cities",
		CONTACT_CITIES_FALLBACK,
	);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!fullName.trim() || !email.trim() || !password || password !== confirm || !businessName.trim()) {
			setError("Completa todos los campos y verifica la contraseña");
			return;
		}
		if (city === "Otra" && !cityOther.trim()) {
			setError("Indica la ciudad");
			return;
		}
		if (!supabase) {
			setError("Configuración de Supabase no disponible");
			return;
		}
		setLoading(true);
		setError(null);
		try {
			const { data, error: signUpError } = await supabase.auth.signUp({
				email: email.trim(),
				password,
				options: { data: { full_name: fullName.trim(), role: "business" } },
			});
			if (signUpError) throw new Error(signUpError.message);
			const user = data.user;
			if (!user) throw new Error("No se pudo crear el usuario");

			const slugBase = businessName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
			const slug = `${slugBase}-${Math.floor(Math.random() * 10000)}`;

			// Crear negocio: si hay sesión, vía API (respeta ADR-0002); si requiere confirmación, vía Supabase directo con service_role (piloto)
			if (data.session?.access_token) {
				const res = await fetch(`${apiUrl()}/businesses`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${data.session.access_token}`,
					},
					body: JSON.stringify({
						name: businessName.trim(),
						slug,
						type: "restaurant",
						phone: phone.trim() || null,
						email: email.trim(),
						is_active: false,
						verification_status: "pending",
					}),
				});
				if (!res.ok) {
					const txt = await res.text().catch(() => "");
					throw new Error(txt || "No se pudo crear el negocio");
				}
			} else {
				// Sin sesión (email por confirmar) — insert directo con service_role para no perder el negocio pendiente
				if (!supabase) throw new Error("Supabase no disponible");
				const { error: bizError } = await supabase.from("businesses").insert({
					owner_id: user.id,
					name: businessName.trim(),
					slug,
					type: "restaurant",
					phone: phone.trim() || null,
					email: email.trim(),
					is_active: false,
					verification_status: "pending",
				});
				if (bizError) throw new Error(bizError.message);
			}

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
					<h1 className="font-heading text-3xl font-bold">¡Recibimos tu solicitud!</h1>
					<p className="mt-4 text-role-muted-foreground">Tu negocio está en revisión. Te contactaremos en menos de 24 horas para activarlo. Revisa tu correo para confirmar tu cuenta si es necesario.</p>
					<a href="/" className="mt-8 inline-block rounded-full bg-role-primary px-6 py-3 font-semibold text-white">
						Volver al inicio
					</a>
				</main>
				<Footer />
			</div>
		);
	}

	return (
		<div className="min-h-screen">
			<Navbar />
			<main className="mx-auto max-w-xl px-6 pt-32 pb-24">
				<h1 className="font-heading text-3xl font-bold">Registrar mi negocio</h1>
				<p className="mt-2 text-role-muted-foreground">Crea tu cuenta y tu negocio en un solo paso. Quedará en estado pendiente hasta verificación.</p>
				<form onSubmit={submit} className="mt-8 space-y-4">
					<div>
						<Label>Tu nombre *</Label>
						<Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nombre completo" required />
					</div>
					<div>
						<Label>Email *</Label>
						<Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" required />
					</div>
					<div>
						<Label>Contraseña *</Label>
						<Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
					</div>
					<div>
						<Label>Confirmar contraseña *</Label>
						<Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
					</div>
					<div>
						<Label>Nombre del negocio *</Label>
						<Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Panadería La Espiga" required />
					</div>
					<div>
						<Label>Teléfono</Label>
						<Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+593 ..." />
					</div>
					<div>
						<Label>Ciudad</Label>
						<Select value={city} onValueChange={(v) => v && setCity(v)}>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Selecciona ciudad" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{cities.map((c) => (
										<SelectItem key={c} value={c}>
											{c}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
					{city === "Otra" ? (
						<div>
							<Label>¿Qué ciudad?</Label>
							<Input value={cityOther} onChange={(e) => setCityOther(e.target.value)} placeholder="Escribe tu ciudad" />
						</div>
					) : null}
					{error ? <p className="text-sm text-red-600">{error}</p> : null}
					<Button type="submit" disabled={loading} className="w-full rounded-full">
						{loading ? "Registrando..." : "Registrar negocio"}
					</Button>
					<p className="text-xs text-role-muted-foreground text-center">Al registrar, tu negocio quedará en <b>pendiente</b> y no será visible hasta ser aprobado desde el admin. Se enviará email a ti y al equipo.</p>
				</form>
			</main>
			<Footer />
		</div>
	);
}
