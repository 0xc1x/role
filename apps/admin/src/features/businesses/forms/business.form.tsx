import type { BusinessDto } from "@0xc1x/role-commons";
import { UpdateBusinessSchema } from "@0xc1x/role-commons";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError } from "@/lib/api/errors";
import { useUpdateBusiness } from "../queries/businesses.queries";

const formSchema = UpdateBusinessSchema.extend({
	name: z.string().min(1).optional(),
	verification_status: z.enum(["pending", "approved", "rejected"]).optional(),
	rejection_reason: z.string().nullable().optional(),
});

type Values = z.input<typeof formSchema>;

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
	const form = useForm({
		defaultValues: {
			name: business.name ?? "",
			verification_status: business.verification_status ?? "pending",
			rejection_reason: business.rejection_reason ?? "",
		} as Values,
		validators: { onSubmit: formSchema },
		onSubmit: async ({ value }) => {
			await updateMutation.mutateAsync({
				id: business.id,
				body: {
					name: value.name || undefined,
					verification_status: value.verification_status,
					rejection_reason: value.rejection_reason || null,
				} as never,
			});
			onSuccess?.();
		},
	});

	const formError = updateMutation.error;

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
			{formError && (
				<p className="text-sm text-destructive">
					{formError instanceof ApiClientError ? formError.message : "Error inesperado"}
				</p>
			)}
			<form.Field name="name">
				{(field) => (
					<Field>
						<FieldLabel>Nombre</FieldLabel>
						<Input value={field.state.value ?? ""} onChange={(e) => field.handleChange(e.target.value)} />
						{field.state.meta.isTouched && !field.state.meta.isValid && <FieldError errors={field.state.meta.errors} />}
					</Field>
				)}
			</form.Field>
			<form.Field name="verification_status">
				{(field) => (
					<Field>
						<FieldLabel>Estado verificación</FieldLabel>
						<Select value={field.state.value} onValueChange={(v) => field.handleChange(v as never)}>
							<SelectTrigger><SelectValue /></SelectTrigger>
							<SelectContent>
								<SelectItem value="pending">Pendiente</SelectItem>
								<SelectItem value="approved">Aprobado</SelectItem>
								<SelectItem value="rejected">Rechazado</SelectItem>
							</SelectContent>
						</Select>
					</Field>
				)}
			</form.Field>
			<form.Field name="rejection_reason">
				{(field) => (
					<Field>
						<FieldLabel>Motivo rechazo (si aplica)</FieldLabel>
						<Textarea value={field.state.value ?? ""} onChange={(e) => field.handleChange(e.target.value)} placeholder="Motivo..." />
					</Field>
				)}
			</form.Field>
		</form>
	);
}
