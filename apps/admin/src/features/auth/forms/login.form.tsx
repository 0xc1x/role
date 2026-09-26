import { LoginRequestSchema } from "@0xc1x/role-commons";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { clearAuth, useLogin } from "@/features/auth";

// Límites del contrato (`LoginRequestSchema`); mensajes propios para la UX.
const loginSchema = LoginRequestSchema.extend({
	email: z.email("Email inválido"),
	password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

type LoginValues = { email: string; password: string };

/**
 * El botón se deshabilita cuando el form no es válido, pero el operador no tiene
 * forma de saber QUÉ lo bloquea: el submit muere en silencio. Estos mensajes son
 * los del propio schema, así que el aviso no puede desincronizarse de la regla.
 */
function blockingHints(values: LoginValues): string[] {
	const hints: string[] = [];
	const email = loginSchema.shape.email.safeParse(values.email);
	if (!email.success)
		hints.push(email.error.issues[0]?.message ?? "Email inválido");
	const password = loginSchema.shape.password.safeParse(values.password);
	if (!password.success) {
		hints.push(
			password.error.issues[0]?.message ??
				"La contraseña debe tener al menos 6 caracteres",
		);
	}
	return hints;
}

export function LoginForm({
	sessionExpired = false,
	returnTo,
}: {
	sessionExpired?: boolean;
	returnTo?: string;
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const loginMutation = useLogin();
	const [roleError, setRoleError] = useState(false);

	const form = useForm({
		defaultValues: { email: "", password: "" },
		validators: { onSubmit: loginSchema },
		onSubmit: async ({ value }) => {
			setRoleError(false);
			await loginMutation.mutateAsync(value, {
				onSuccess: (data) => {
					if (data.user.role !== "admin") {
						clearAuth();
						queryClient.clear();
						setRoleError(true);
						return;
					}
					// `returnTo` ya viene sanitizada por el `validateSearch` del
					// login (ruta interna, sin protocolo). El cast es porque el
					// router tipa `to` contra las rutas registradas en build.
					void navigate({
						to: (returnTo ?? "/home") as "/home",
						replace: true,
					});
				},
			});
		},
	});

	return (
		<Card className="w-full max-w-md">
			<CardHeader>
				<CardTitle className="text-2xl">Login</CardTitle>
				<CardDescription>Ingresa tus credenciales para acceder</CardDescription>
			</CardHeader>
			<CardContent>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-6"
				>
					{sessionExpired ? (
						<output className="block rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
							Tu sesión expiró por seguridad. Vuelve a iniciar sesión para
							continuar donde estabas.
						</output>
					) : null}
					<FieldGroup>
						<form.Field name="email">
							{(field) => {
								const isInvalid =
									field.state.meta.isTouched && !field.state.meta.isValid;
								return (
									<Field data-invalid={isInvalid}>
										<FieldLabel htmlFor={field.name}>Email</FieldLabel>
										<Input
											id={field.name}
											name={field.name}
											type="email"
											placeholder="tu@email.com"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											aria-invalid={isInvalid}
										/>
										{isInvalid && (
											<FieldError errors={field.state.meta.errors} />
										)}
									</Field>
								);
							}}
						</form.Field>

						<form.Field name="password">
							{(field) => {
								const isInvalid =
									field.state.meta.isTouched && !field.state.meta.isValid;
								return (
									<Field data-invalid={isInvalid}>
										<FieldLabel htmlFor={field.name}>Contraseña</FieldLabel>
										<Input
											id={field.name}
											name={field.name}
											type="password"
											placeholder="••••••••"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											aria-invalid={isInvalid}
										/>
										{isInvalid && (
											<FieldError errors={field.state.meta.errors} />
										)}
									</Field>
								);
							}}
						</form.Field>
					</FieldGroup>

					{(loginMutation.isError || roleError) && (
						<p className="text-sm text-destructive text-center">
							{roleError
								? "Solo administradores pueden acceder al panel"
								: loginMutation.error instanceof Error
									? loginMutation.error.message
									: "Error al iniciar sesión"}
						</p>
					)}

					<form.Subscribe
						selector={(state) => ({
							canSubmit: state.canSubmit,
							isSubmitting: state.isSubmitting,
							values: state.values,
						})}
					>
						{({ canSubmit, isSubmitting, values }) => {
							const disabled =
								!canSubmit || isSubmitting || loginMutation.isPending;
							const hints = disabled ? blockingHints(values) : [];
							return (
								<div className="space-y-2">
									{hints.length > 0 ? (
										<output className="block text-sm text-destructive text-center">
											Revisa: {hints.join(" · ")}
										</output>
									) : null}
									<Button type="submit" className="w-full" disabled={disabled}>
										{isSubmitting || loginMutation.isPending
											? "Iniciando sesión..."
											: "Iniciar Sesión"}
									</Button>
								</div>
							);
						}}
					</form.Subscribe>
				</form>
			</CardContent>
		</Card>
	);
}
