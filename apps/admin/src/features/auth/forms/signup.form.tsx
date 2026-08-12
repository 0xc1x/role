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
import { Spinner } from "@/components/ui/spinner"
import { Input } from "@/components/ui/input";
import { clearAuth, useRegister } from "@/features/auth";

const signupSchema = z.object({
    name: z
        .string()
        .min(1, "El nombre es obligatorio")
        .min(2, "El nombre debe tener al menos 2 caracteres"),
    email: z.string().min(1, "El email es obligatorio").email("Email inválido"),
    password: z
        .string()
        .min(1, "La contraseña es obligatoria")
        .min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export function SignupForm() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const registerMutation = useRegister();
    const [roleError, setRoleError] = useState(false);
    const form = useForm({
        defaultValues: {
            name: "",
            email: "",
            password: "",
        },
        validators: {
            onSubmit: signupSchema,
        },
        onSubmit: async ({ value }) => {
            setRoleError(false);
            await registerMutation.mutateAsync(
                {
                    email: value.email,
                    password: value.password,
                    full_name: value.name,
                },
                {
                    onSuccess: (data) => {
                        if (data.user.role !== "admin") {
                            clearAuth();
                            queryClient.clear();
                            setRoleError(true);
                            return;
                        }
                        navigate({ to: "/home" });
                    },
                },
            );
        },
    });
    return (
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle className="text-2xl">Sign Up</CardTitle>
                <CardDescription>Crea tu cuenta para comenzar</CardDescription>
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
                        <form.Field
                            name="name"
                            children={(field) => {
                                const isInvalid =
                                    field.state.meta.isTouched && !field.state.meta.isValid;

                                return (
                                    <Field data-invalid={isInvalid}>
                                        <FieldLabel htmlFor={field.name}>Nombre</FieldLabel>
                                        <Input
                                            id={field.name}
                                            name={field.name}
                                            type="text"
                                            placeholder="Tu nombre"
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
                        />

                        <form.Field
                            name="email"
                            children={(field) => {
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
                        />

                        <form.Field
                            name="password"
                            children={(field) => {
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
                        />
                    </FieldGroup>

                    {(registerMutation.isError || roleError) && (
                        <p className="text-sm text-destructive text-center">
                            {roleError
                                ? "Solo administradores pueden acceder al panel"
                                : registerMutation.error instanceof Error
                                    ? registerMutation.error.message
                                    : "Error al registrar"}
                        </p>
                    )}

                    <form.Subscribe
                        selector={(state) => [state.canSubmit, state.isSubmitting]}
                    >
                        {([canSubmit, isSubmitting]) => (
                            <Button
                                type="submit"
                                className="w-full"
                                disabled={
                                    !canSubmit || isSubmitting || registerMutation.isPending
                                }
                            >
                                {isSubmitting || registerMutation.isPending
                                    ? <>
                                        <Spinner /> Creando cuenta...
                                    </>
                                    : "Crear Cuenta"}
                            </Button>
                        )}
                    </form.Subscribe>
                </form>
            </CardContent>
        </Card>
    );
}
