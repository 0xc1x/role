import {
	APP_CONFIG_CATEGORIES,
	APP_CONFIG_VALUE_TYPES,
	type AppConfigCategory,
	type AppConfigDto,
	type AppConfigValueType,
	type CreateAppConfigDto,
	CreateAppConfigFormSchema,
	type UpdateAppConfigDto,
} from "@0xc1x/role-commons";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError } from "@/lib/api/errors";
import {
	useCreateAppConfig,
	useUpdateAppConfig,
} from "../queries/app-config.queries";

const VALUE_TYPE_OPTIONS = [
	{ value: "string", label: "Texto corto" },
	{ value: "text", label: "Texto largo" },
	{ value: "number", label: "Número" },
	{ value: "boolean", label: "Sí / No" },
	{ value: "email", label: "Email" },
	{ value: "url", label: "URL" },
	{ value: "phone", label: "Teléfono" },
] as const;

const CATEGORY_OPTIONS = APP_CONFIG_CATEGORIES.map((c) => ({
	value: c,
	label: c.charAt(0).toUpperCase() + c.slice(1),
}));

/** El form trabaja con "" para descripción vacía; commons espera null.
 *  El form siempre provee todos los valores; quitamos defaults de commons. */
const configFormSchema = CreateAppConfigFormSchema.omit({
	description: true,
}).extend({
	value_type: z.enum(APP_CONFIG_VALUE_TYPES),
	category: z.enum(APP_CONFIG_CATEGORIES),
	is_public: z.boolean(),
	active: z.boolean(),
	description: z
		.string()
		.max(500)
		.transform((v) => (v === "" ? null : v)),
});

interface AppConfigFormProps {
	formId: string;
	onSuccess?: () => void;
	config?: AppConfigDto;
}

export function AppConfigForm({
	formId,
	onSuccess,
	config,
}: AppConfigFormProps) {
	const createMutation = useCreateAppConfig();
	const updateMutation = useUpdateAppConfig();

	const form = useForm({
		defaultValues: {
			key: config?.key ?? "",
			value: config?.value ?? ("" as string | number | boolean),
			value_type: (config?.value_type ?? "string") as AppConfigValueType,
			category: (config?.category ?? "general") as AppConfigCategory,
			label: config?.label ?? "",
			description: config?.description ?? "",
			is_public: config?.is_public ?? true,
			active: config?.active ?? true,
		},
		validators: { onSubmit: configFormSchema },
		onSubmit: async ({ value }) => {
			const valueType = value.value_type;
			let parsedValue: string | number | boolean = value.value;

			if (valueType === "number") {
				parsedValue =
					typeof value.value === "number" ? value.value : Number(value.value);
			} else if (valueType === "boolean") {
				parsedValue = Boolean(value.value);
			} else {
				parsedValue = String(value.value);
			}

			const payload = {
				key: value.key,
				value: parsedValue,
				value_type: valueType,
				category: value.category,
				label: value.label,
				description: value.description || null,
				is_public: value.is_public,
				active: value.active,
			};

			if (config) {
				const { key: _key, ...body } = payload;
				await updateMutation.mutateAsync({
					key: config.key,
					body: body as UpdateAppConfigDto,
				});
			} else {
				await createMutation.mutateAsync(payload as CreateAppConfigDto);
			}
			onSuccess?.();
		},
	});

	const formError = createMutation.error ?? updateMutation.error;
	const valueType = form.state.values.value_type;

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

			<form.Field name="key">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<Field data-invalid={isInvalid}>
							<FieldLabel htmlFor={field.name}>Clave</FieldLabel>
							<Input
								id={field.name}
								name={field.name}
								type="text"
								placeholder="fees.vat_percent"
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								disabled={Boolean(config)}
								aria-invalid={isInvalid}
							/>
							{isInvalid && <FieldError errors={field.state.meta.errors} />}
						</Field>
					);
				}}
			</form.Field>

			<form.Field name="label">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<Field data-invalid={isInvalid}>
							<FieldLabel htmlFor={field.name}>Etiqueta</FieldLabel>
							<Input
								id={field.name}
								name={field.name}
								type="text"
								placeholder="IVA aplicable (%)"
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

			<div className="grid grid-cols-2 gap-4">
				<form.Field name="value_type">
					{(field) => (
						<Field>
							<FieldLabel htmlFor={field.name}>Tipo de valor</FieldLabel>
							<Select
								value={field.state.value}
								onValueChange={(v) => {
									if (!v) return;
									field.handleChange(v as AppConfigValueType);
									if (v === "boolean") {
										form.setFieldValue("value", false);
									} else if (
										v === "number" &&
										typeof form.state.values.value !== "number"
									) {
										form.setFieldValue("value", "");
									}
								}}
							>
								<SelectTrigger id={field.name} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{VALUE_TYPE_OPTIONS.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
					)}
				</form.Field>

				<form.Field name="category">
					{(field) => (
						<Field>
							<FieldLabel htmlFor={field.name}>Categoría</FieldLabel>
							<Select
								value={field.state.value}
								onValueChange={(v) => {
									if (v) field.handleChange(v as AppConfigCategory);
								}}
							>
								<SelectTrigger id={field.name} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{CATEGORY_OPTIONS.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
					)}
				</form.Field>
			</div>

			<form.Field name="value">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;

					if (valueType === "boolean") {
						const checked = Boolean(field.state.value);
						return (
							<Field>
								<FieldLabel>Valor</FieldLabel>
								<div className="flex items-center gap-3">
									<Switch
										id={field.name}
										checked={checked}
										onCheckedChange={(checked) => field.handleChange(checked)}
									/>
									<Badge variant={checked ? "default" : "secondary"}>
										{checked ? "true" : "false"}
									</Badge>
								</div>
							</Field>
						);
					}

					return (
						<Field data-invalid={isInvalid}>
							<FieldLabel htmlFor={field.name}>Valor</FieldLabel>
							<Input
								id={field.name}
								name={field.name}
								type={valueType === "number" ? "number" : "text"}
								placeholder={
									valueType === "email"
										? "soporte@role.app"
										: valueType === "url"
											? "https://..."
											: valueType === "phone"
												? "+52 55 0000 0000"
												: "Valor de configuración"
								}
								step="any"
								value={String(field.state.value ?? "")}
								onBlur={field.handleBlur}
								onChange={(e) =>
									field.handleChange(
										valueType === "number"
											? e.target.value === ""
												? ""
												: Number(e.target.value)
											: e.target.value,
									)
								}
								aria-invalid={isInvalid}
							/>
							{isInvalid && <FieldError errors={field.state.meta.errors} />}
						</Field>
					);
				}}
			</form.Field>

			<form.Field name="description">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<Field data-invalid={isInvalid}>
							<FieldLabel htmlFor={field.name}>Descripción</FieldLabel>
							<Textarea
								id={field.name}
								name={field.name}
								placeholder="Para qué se usa este valor"
								rows={2}
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

			<div className="flex gap-6">
				<form.Field name="is_public">
					{(field) => (
						<Field className="flex flex-row items-center gap-3">
							<Switch
								id={field.name}
								checked={field.state.value}
								onCheckedChange={(checked) => field.handleChange(checked)}
							/>
							<FieldLabel htmlFor={field.name} className="font-normal">
								Público (visible en mobile/landing)
							</FieldLabel>
						</Field>
					)}
				</form.Field>

				<form.Field name="active">
					{(field) => (
						<Field className="flex flex-row items-center gap-3">
							<Switch
								id={field.name}
								checked={field.state.value}
								onCheckedChange={(checked) => field.handleChange(checked)}
							/>
							<FieldLabel htmlFor={field.name} className="font-normal">
								Activo
							</FieldLabel>
						</Field>
					)}
				</form.Field>
			</div>

			<p className="text-xs text-muted-foreground">
				Tipos disponibles: {APP_CONFIG_VALUE_TYPES.join(", ")}
			</p>
		</form>
	);
}
