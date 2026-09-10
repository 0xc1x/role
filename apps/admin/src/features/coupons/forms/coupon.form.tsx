import type { CouponDto, CouponType } from "@0xc1x/role-commons";
import { CreateCouponBaseSchema } from "@0xc1x/role-commons";
import { useForm } from "@tanstack/react-form";
import type { ReactNode } from "react";
import { z } from "zod";
import { StatusSwitch } from "@/components/status-switch";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ApiClientError } from "@/lib/api/errors";
import { useCreateCoupon, useUpdateCoupon } from "../queries/coupons.queries";

const COUPON_TYPE_OPTIONS = [
	{ value: "percentage", label: "Porcentaje" },
	{ value: "fixed", label: "Monto fijo" },
] as const;

// Inputs devuelven strings; "" significa "sin valor". Derivado de commons
// (omitimos business_id: el admin crea solo cupones globales).
const couponFormSchema = CreateCouponBaseSchema.omit({ business_id: true })
	.extend({
		value: z
			.string()
			.transform(Number)
			.pipe(z.number().gt(0, "El valor debe ser mayor a 0")),
		min_order_amount: z
			.string()
			.transform((v) => (v === "" ? null : Number(v)))
			.pipe(z.number().min(0, "El mínimo no puede ser negativo").nullable()),
		max_uses: z
			.string()
			.transform((v) => (v === "" ? null : Number(v)))
			.pipe(
				z
					.number()
					.int("Debe ser un número entero")
					.gt(0, "Debe ser mayor a 0")
					.nullable(),
			),
		expires_at: z
			.string()
			.transform((v) => (v === "" ? null : v))
			.pipe(z.string().min(1).nullable()),
	})
	.refine((v) => v.type !== "percentage" || Number(v.value) <= 100, {
		message: "El porcentaje no puede superar 100",
		path: ["value"],
	});

type CouponFormValues = z.input<typeof couponFormSchema>;

interface CouponFormProps {
	formId: string;
	onSuccess?: () => void;
	coupon?: CouponDto;
}

/** Shell compartido Field + label + error de los 7 campos del formulario. */
function FieldShell({
	name,
	label,
	errors,
	isInvalid,
	children,
}: {
	name: string;
	label: string;
	errors: Array<{ message?: string } | undefined>;
	isInvalid: boolean;
	children: ReactNode;
}) {
	return (
		<Field data-invalid={isInvalid}>
			<FieldLabel htmlFor={name}>{label}</FieldLabel>
			{children}
			{isInvalid && <FieldError errors={errors} />}
		</Field>
	);
}

export function CouponForm({ formId, onSuccess, coupon }: CouponFormProps) {
	const createMutation = useCreateCoupon();
	const updateMutation = useUpdateCoupon();
	const form = useForm({
		defaultValues: {
			code: coupon?.code ?? "",
			name: coupon?.name ?? "",
			type: coupon?.type ?? "percentage",
			value: coupon ? String(coupon.value) : "",
			min_order_amount:
				coupon?.min_order_amount != null ? String(coupon.min_order_amount) : "",
			max_uses: coupon?.max_uses != null ? String(coupon.max_uses) : "",
			expires_at: coupon?.expires_at ?? "",
			is_active: coupon?.is_active ?? true,
		} as CouponFormValues,
		validators: { onSubmit: couponFormSchema },
		onSubmit: async ({ value }) => {
			const payload = {
				code: value.code,
				name: value.name,
				type: value.type,
				value: Number(value.value),
				min_order_amount:
					value.min_order_amount === "" ? null : Number(value.min_order_amount),
				max_uses: value.max_uses === "" ? null : Number(value.max_uses),
				is_active: value.is_active ?? true,
				expires_at: value.expires_at === "" ? null : value.expires_at,
			};

			if (coupon) {
				await updateMutation.mutateAsync({ id: coupon.id, body: payload });
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

			<form.Field name="code">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<FieldShell
							name={field.name}
							label="Código"
							errors={field.state.meta.errors}
							isInvalid={isInvalid}
						>
							<Input
								id={field.name}
								name={field.name}
								type="text"
								placeholder="PROMO10"
								className="uppercase"
								value={field.state.value ?? ""}
								onBlur={field.handleBlur}
								onChange={(e) =>
									field.handleChange(e.target.value.toUpperCase())
								}
								aria-invalid={isInvalid}
							/>
						</FieldShell>
					);
				}}
			</form.Field>

			<form.Field name="name">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<FieldShell
							name={field.name}
							label="Nombre"
							errors={field.state.meta.errors}
							isInvalid={isInvalid}
						>
							<Input
								id={field.name}
								name={field.name}
								type="text"
								placeholder="Nombre del cupón"
								value={field.state.value ?? ""}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								aria-invalid={isInvalid}
							/>
						</FieldShell>
					);
				}}
			</form.Field>

			<form.Field name="type">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<FieldShell
							name={field.name}
							label="Tipo"
							errors={field.state.meta.errors}
							isInvalid={isInvalid}
						>
							<Select
								value={field.state.value}
								onValueChange={(v) => {
									if (v) field.handleChange(v as CouponType);
								}}
							>
								<SelectTrigger
									id={field.name}
									className="w-full"
									aria-invalid={isInvalid}
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{COUPON_TYPE_OPTIONS.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FieldShell>
					);
				}}
			</form.Field>

			<form.Field name="value">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					const isPercentage = form.state.values.type === "percentage";
					return (
						<FieldShell
							name={field.name}
							label="Valor"
							errors={field.state.meta.errors}
							isInvalid={isInvalid}
						>
							<Input
								id={field.name}
								name={field.name}
								type="number"
								min="0"
								step="0.01"
								placeholder={isPercentage ? "15" : "50"}
								value={field.state.value ?? ""}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								aria-invalid={isInvalid}
							/>
							<p className="text-xs text-muted-foreground">
								{isPercentage
									? "Porcentaje de descuento (1–100)"
									: "Monto fijo de descuento en USD"}
							</p>
						</FieldShell>
					);
				}}
			</form.Field>

			<form.Field name="min_order_amount">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<FieldShell
							name={field.name}
							label="Monto mínimo (USD)"
							errors={field.state.meta.errors}
							isInvalid={isInvalid}
						>
							<Input
								id={field.name}
								name={field.name}
								type="number"
								min="0"
								step="0.01"
								placeholder="Sin mínimo"
								value={field.state.value ?? ""}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								aria-invalid={isInvalid}
							/>
						</FieldShell>
					);
				}}
			</form.Field>

			<form.Field name="max_uses">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<FieldShell
							name={field.name}
							label="Usos máximos"
							errors={field.state.meta.errors}
							isInvalid={isInvalid}
						>
							<Input
								id={field.name}
								name={field.name}
								type="number"
								min="1"
								step="1"
								placeholder="Sin límite"
								value={field.state.value ?? ""}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								aria-invalid={isInvalid}
							/>
						</FieldShell>
					);
				}}
			</form.Field>

			<form.Field name="expires_at">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<FieldShell
							name={field.name}
							label="Fecha de expiración"
							errors={field.state.meta.errors}
							isInvalid={isInvalid}
						>
							<DateTimePicker
								value={field.state.value ?? ""}
								onChange={(v) => field.handleChange(v)}
								placeholder="Sin expiración"
							/>
						</FieldShell>
					);
				}}
			</form.Field>

			{coupon && (
				<form.Field name="is_active">
					{(field) => {
						const isActive = field.state.value;
						return (
							<Field>
								<FieldLabel>Estado</FieldLabel>
								<StatusSwitch
									checked={isActive ?? true}
									onCheckedChange={(checked) => field.handleChange(checked)}
								/>
							</Field>
						);
					}}
				</form.Field>
			)}
		</form>
	);
}
