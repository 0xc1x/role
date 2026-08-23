import { CreateTipSchema, type TipDto } from "@0xc1x/role-commons";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError } from "@/lib/api/errors";
import { useCreateTip, useUpdateTip } from "../queries/tips.queries";

// active siempre boolean en el formulario (sin default de creación).
const tipFormSchema = CreateTipSchema.extend({ active: z.boolean() });

type TipFormValues = {
	content: string;
	active: boolean;
};

interface TipFormProps {
	formId: string;
	onSuccess?: () => void;
	tip?: TipDto;
}

export function TipForm({ formId, onSuccess, tip }: TipFormProps) {
	const createMutation = useCreateTip();
	const updateMutation = useUpdateTip();
	const form = useForm({
		defaultValues: {
			content: tip?.content ?? "",
			active: tip?.active ?? true,
		} as TipFormValues,
		validators: { onSubmit: tipFormSchema },
		onSubmit: async ({ value }) => {
			const payload = {
				content: value.content,
				active: value.active ?? true,
			};

			if (tip) {
				await updateMutation.mutateAsync({ id: tip.id, body: payload });
			} else {
				await createMutation.mutateAsync(payload);
			}
			onSuccess?.();
		},
	});

	const formError = createMutation.error ?? updateMutation.error;

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

			<form.Field name="content">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<Field data-invalid={isInvalid}>
							<FieldLabel htmlFor={field.name}>Consejo</FieldLabel>
							<Textarea
								id={field.name}
								name={field.name}
								placeholder="Texto del consejo"
								value={field.state.value ?? ""}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								aria-invalid={isInvalid}
							/>
							{isInvalid && <FieldError errors={field.state.meta.errors} />}
						</Field>
					);
				}}
			</form.Field>

			{tip && (
				<form.Field name="active">
					{(field) => {
						const isActive = field.state.value;
						return (
							<Field>
								<FieldLabel>Estado</FieldLabel>
								<div className="flex items-center gap-3">
									<Switch
										checked={isActive}
										onCheckedChange={(checked) => field.handleChange(checked)}
										className="data-checked:border-emerald-500 data-checked:bg-emerald-500 data-unchecked:border-red-500 data-unchecked:bg-red-500 dark:data-unchecked:border-red-600 dark:data-unchecked:bg-red-600"
									/>
									<Badge
										variant={isActive ? "default" : "destructive"}
										className={isActive ? "bg-green-500/10 text-green-600" : ""}
									>
										{isActive ? "Activo" : "Inactivo"}
									</Badge>
								</div>
							</Field>
						);
					}}
				</form.Field>
			)}
		</form>
	);
}
