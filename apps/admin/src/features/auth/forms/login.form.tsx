import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import * as z from "zod";

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

const loginSchema = z.object({
	email: z.string().min(1, "El email es obligatorio").email("Email inválido"),
	password: z
		.string()
		.min(1, "La contraseña es obligatoria")
		.min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export function LoginForm() {
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
					navigate({ to: "/home" });
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
						selector={(state) => [state.canSubmit, state.isSubmitting]}
					>
						{([canSubmit, isSubmitting]) => (
							<Button
								type="submit"
								className="w-full"
								disabled={!canSubmit || isSubmitting || loginMutation.isPending}
							>
								{isSubmitting || loginMutation.isPending
									? "Iniciando sesión..."
									: "Iniciar Sesión"}
							</Button>
						)}
					</form.Subscribe>
				</form>
			</CardContent>
		</Card>
	);
}
