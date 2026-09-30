import type {
	BusinessDto,
	BusinessVerificationStatus,
} from "@0xc1x/role-commons";
import {
	BusinessVerificationStatusSchema,
	UpdateBusinessSchema,
} from "@0xc1x/role-commons";
import { useForm } from "@tanstack/react-form";
import { useMemo } from "react";
import { z } from "zod";
import { useReportDrawerPending } from "@/components/resource/resource-drawer";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, getApiFieldErrors } from "@/lib/api/errors";
import { useUpdateBusiness } from "../queries/businesses.queries";

const formSchema = UpdateBusinessSchema.extend({
	name: z.string().min(1).optional(),
	verification_status: BusinessVerificationStatusSchema.optional(),
	rejection_reason: z.string().nullable().optional(),
});

type Values = z.input<typeof formSchema>;

/** Campos del form: los `path` de `details[]` que se pueden asociar a un input. */
const FORM_FIELDS = [
	"name",
	"verification_status",
	"rejection_reason",
] as const;

export function BusinessForm({
	formId,
	onSuccess,
	business,
}: {
	formId: string;
	onSuccess?: () => void;
	business: BusinessDto;
}) {
	const updateMutation = useUpdateBusiness();
	useReportDrawerPending(updateMutation.isPending);
	const form = useForm({
		defaultValues: {
			name: business.name ?? "",
			verification_status: business.verification_status ?? "pending",
			rejection_reason: business.rejection_reason ?? "",
		} as Values,
		validators: { onSubmit: formSchema },
		onSubmit: async ({ value }) => {
			try {
				await updateMutation.mutateAsync({
					id: business.id,
					body: {
						name: value.name || undefined,
						verification_status: value.verification_status,
						rejection_reason: value.rejection_reason || null,
					},
				});
			} catch {
				// El error se pinta en el campo que falló (abajo): dejarlo
				// propagar sería un unhandled rejection sin nada que mostrar.
				return;
			}
			onSuccess?.();
		},
	});

	const formError = updateMutation.error;
	// El 400 de `ZodValidationPipe` trae `details[{ path, message }]`: se reparte
	// al campo que falló. Antes todo iba a un párrafo arriba y el operador tenía
	// que diffear dos cadenas a ojo para saber qué corregir.
	const fieldErrors = useMemo(() => getApiFieldErrors(formError), [formError]);
	const unmappedErrors = useMemo(() => {
		if (!(formError instanceof ApiClientError)) return [];
		if (!formError.details) return [formError.message];
		// Si ningún `path` corresponde a un campo de este form (p. ej. `slug`), el
		// mensaje general se sigue mostrando: texto antes que nada.
		const mapped = FORM_FIELDS.some((field) => field in fieldErrors);
		return mapped ? [] : [formError.message];
	}, [formError, fieldErrors]);

	return (
		<form
			id={formId}
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
			className="space-y-4"
		>
			{unmappedErrors.map((message) => (
				<p key={message} className="text-sm text-destructive">
					{message}
				</p>
			))}
			<form.Field name="name">
				{(field) => {
					const serverError = fieldErrors.name;
					const isInvalid =
						(field.state.meta.isTouched && !field.state.meta.isValid) ||
						Boolean(serverError);
					return (
						<Field data-invalid={isInvalid}>
							<FieldLabel htmlFor={`${formId}-name`}>Nombre</FieldLabel>
							<Input
								id={`${formId}-name`}
								value={field.state.value ?? ""}
								aria-invalid={isInvalid}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
							{serverError ? (
								<FieldError errors={[{ message: serverError }]} />
							) : (
								field.state.meta.isTouched &&
								!field.state.meta.isValid && (
									<FieldError errors={field.state.meta.errors} />
								)
							)}
						</Field>
					);
				}}
			</form.Field>
			<form.Field name="verification_status">
				{(field) => {
					const serverError = fieldErrors.verification_status;
					return (
						<Field data-invalid={Boolean(serverError)}>
							<FieldLabel>Estado verificación</FieldLabel>
							<Select
								value={field.state.value}
								onValueChange={(v) =>
									field.handleChange(v as BusinessVerificationStatus)
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="pending">Pendiente</SelectItem>
									<SelectItem value="approved">Aprobado</SelectItem>
									<SelectItem value="rejected">Rechazado</SelectItem>
								</SelectContent>
							</Select>
							{serverError ? (
								<FieldError errors={[{ message: serverError }]} />
							) : null}
						</Field>
					);
				}}
			</form.Field>
			<form.Field name="rejection_reason">
				{(field) => {
					const serverError = fieldErrors.rejection_reason;
					return (
						<Field data-invalid={Boolean(serverError)}>
							<FieldLabel>Motivo rechazo (si aplica)</FieldLabel>
							<Textarea
								value={field.state.value ?? ""}
								aria-invalid={Boolean(serverError)}
								onChange={(e) => field.handleChange(e.target.value)}
								placeholder="Motivo..."
							/>
							{serverError ? (
								<FieldError errors={[{ message: serverError }]} />
							) : null}
						</Field>
					);
				}}
			</form.Field>
		</form>
	);
}
