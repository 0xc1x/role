import type { CommissionDto } from "@0xc1x/role-commons";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiClientError } from "@/lib/api/errors";
import { useUpdateCommission } from "../queries/commissions.queries";

const commissionFormSchema = z.object({
	percent: z
		.string()
		.min(1, "Ingresa un valor")
		.refine((v) => !Number.isNaN(Number(v)), "Ingresa un número")
		.refine(
			(v) => Number(v) >= 0 && Number(v) <= 100,
			"La comisión debe estar entre 0 y 100",
		),
});
type CommissionFormValues = z.input<typeof commissionFormSchema>;

interface CommissionFormProps {
	formId: string;
	onSuccess?: () => void;
	commission: CommissionDto;
}

export function CommissionForm({
	formId,
	onSuccess,
	commission,
}: CommissionFormProps) {
	const updateMutation = useUpdateCommission();
	const form = useForm({
		defaultValues: {
			// stored as a fraction (0.1); the form works in percent (10)
			percent: String(Math.round(commission.commission_rate * 10000) / 100),
		} as CommissionFormValues,
		validators: { onSubmit: commissionFormSchema },
		onSubmit: async ({ value }) => {
			await updateMutation.mutateAsync({
				id: commission.id,
				body: { commission_rate: Number(value.percent) / 100 },
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
					{formError instanceof ApiClientError
						? formError.message
						: formError instanceof Error
							? formError.message
							: "Error inesperado"}
				</p>
			)}

			<form.Field name="percent">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<Field data-invalid={isInvalid}>
							<FieldLabel htmlFor={field.name}>Comisión (%)</FieldLabel>
							<Input
								id={field.name}
								name={field.name}
								type="number"
								min={0}
								max={100}
								step="0.01"
								placeholder="10"
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								aria-invalid={isInvalid}
							/>
							{isInvalid && <FieldError errors={field.state.meta.errors} />}
						</Field>
					);
				}}
			</form.Field>
		</form>
	);
}
