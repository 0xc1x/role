import {
	APP_CONFIG_CATEGORIES,
	APP_CONFIG_VALUE_TYPES,
	type AppConfigCategory,
	type AppConfigDto,
	type AppConfigValueSchema,
	type AppConfigValueType,
	CreateAppConfigFormSchema,
} from "@0xc1x/role-commons";
import { useForm } from "@tanstack/react-form";
import { type ComponentProps, type FormEvent, useState } from "react";
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
	{ value: "json", label: "JSON" },
] as const;

const CATEGORY_OPTIONS = APP_CONFIG_CATEGORIES.map((c) => ({
	value: c,
	label: c.charAt(0).toUpperCase() + c.slice(1),
}));

/** El form trabaja con "" para descripción vacía; commons espera null.
 *  El form siempre provee todos los valores; quitamos defaults de commons.
 *  value en el form es siempre string|number|boolean (json se edita como string JSON y se parsea en onSubmit). */
const configFormSchema = CreateAppConfigFormSchema.omit({
	description: true,
	value: true,
}).extend({
	value: z.union([z.string(), z.number(), z.boolean()]),
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

type FormValue = string | number | boolean;
type ParsedValue = z.infer<typeof AppConfigValueSchema>;

/** JSONB → editable: primitivos pasan; arrays/objetos se editan como string JSON. */
function toFormValue(config?: AppConfigDto): FormValue {
	const value = config?.value;
	if (value === undefined || value === null) return "";
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return value;
	}
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

type ParseResult = { parsed?: ParsedValue; error?: string };

/** Texto y derivados (email/url/phone): el form los edita como string. */
function parseTextValue(value: FormValue): ParseResult {
	return { parsed: String(value) as ParsedValue };
}

function parseNumberValue(value: FormValue): ParseResult {
	const parsed = typeof value === "number" ? value : Number(value);
	return { parsed: parsed as ParsedValue };
}

function parseBooleanValue(value: FormValue): ParseResult {
	return { parsed: Boolean(value) as ParsedValue };
}

function parseJsonValue(value: FormValue): ParseResult {
	const raw = typeof value === "string" ? value : JSON.stringify(value);
	const trimmed = raw.trim();
	if (trimmed === "") {
		return { error: "El valor JSON no puede estar vacío" };
	}
	try {
		return { parsed: JSON.parse(trimmed) as ParsedValue };
	} catch {
		return {
			error: 'JSON inválido. Ej: ["Quito","Guayaquil","Cuenca","Manta","Otra"]',
		};
	}
}

const VALUE_PARSERS: Record<
	AppConfigValueType,
	(value: FormValue) => ParseResult
> = {
	string: parseTextValue,
	text: parseTextValue,
	email: parseTextValue,
	url: parseTextValue,
	phone: parseTextValue,
	number: parseNumberValue,
	boolean: parseBooleanValue,
	json: parseJsonValue,
};

/** Parsea el valor crudo del form según el tipo elegido (lógica pura, sin efectos). */
function parseValueByType(
	valueType: AppConfigValueType,
	value: FormValue,
): ParseResult {
	return VALUE_PARSERS[valueType](value);
}

function useAppConfigForm({
	config,
	onSuccess,
}: {
	config?: AppConfigDto;
	onSuccess?: () => void;
}) {
	const createMutation = useCreateAppConfig();
	const updateMutation = useUpdateAppConfig();
	const [localError, setLocalError] = useState<string | null>(null);

	const form = useForm({
		defaultValues: {
			key: config?.key ?? "",
			value: toFormValue(config),
			value_type: (config?.value_type ?? "string") as AppConfigValueType,
			category: (config?.category ?? "general") as AppConfigCategory,
			label: config?.label ?? "",
			description: config?.description ?? "",
			is_public: config?.is_public ?? true,
			active: config?.active ?? true,
		},
		validators: { onSubmit: configFormSchema },
		onSubmit: async ({ value }) => {
			setLocalError(null);
			const { parsed, error: parseError } = parseValueByType(
				value.value_type,
				value.value,
			);
			if (parseError || parsed === undefined) {
				setLocalError(parseError ?? "Valor inválido");
				return;
			}

			const payload = {
				key: value.key,
				value: parsed,
				value_type: value.value_type,
				category: value.category,
				label: value.label,
				description: value.description || null,
				is_public: value.is_public,
				active: value.active,
			};

			if (config) {
				const { key: _key, ...body } = payload;
				await updateMutation.mutateAsync({ key: config.key, body });
			} else {
				await createMutation.mutateAsync(payload);
			}
			onSuccess?.();
		},
	});

	const error = localError ?? createMutation.error ?? updateMutation.error;
	return { form, error, clearError: () => setLocalError(null) };
}

type AppConfigFormApi = ReturnType<typeof useAppConfigForm>["form"];

function coerceToBoolean(form: AppConfigFormApi): void {
	form.setFieldValue("value", false);
}

function coerceToJson(form: AppConfigFormApi): void {
	const current = form.getFieldValue("value");
	if (typeof current !== "string") {
		try {
			form.setFieldValue("value", JSON.stringify(current, null, 2));
		} catch {
			form.setFieldValue("value", String(current ?? ""));
		}
	}
}

function coerceToNumber(form: AppConfigFormApi): void {
	if (typeof form.state.values.value !== "number") {
		form.setFieldValue("value", "");
	}
}

function coerceToText(form: AppConfigFormApi): void {
	// tipos texto/email/url/phone: si venía de json como string JSON válido, intenta mantenerlo legible
	const current = form.getFieldValue("value");
	if (typeof current === "string") {
		try {
			const parsed: unknown = JSON.parse(current);
			if (Array.isArray(parsed)) {
				form.setFieldValue("value", parsed.join(", "));
			}
		} catch {
			// dejar como string
		}
	}
}

const VALUE_COERCERS: Record<
	AppConfigValueType,
	(form: AppConfigFormApi) => void
> = {
	boolean: coerceToBoolean,
	json: coerceToJson,
	number: coerceToNumber,
	string: coerceToText,
	text: coerceToText,
	email: coerceToText,
	url: coerceToText,
	phone: coerceToText,
};

/** Reajusta el valor crudo cuando cambia el tipo (boolean/json/number/texto). */
function coerceValueForType(
	form: AppConfigFormApi,
	nextType: AppConfigValueType,
): void {
	VALUE_COERCERS[nextType](form);
}

function ConfigFormError({ error }: { error: unknown }) {
	if (!error) return null;
	return (
		<p className="text-sm text-destructive">
			{typeof error === "string"
				? error
				: error instanceof ApiClientError
					? error.message
					: error instanceof Error
						? error.message
						: "Error inesperado"}
		</p>
	);
}

function ConfigIdentitySection({
	form,
	isEdit,
}: {
	form: AppConfigFormApi;
	isEdit: boolean;
}) {
	return (
		<>
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
								disabled={isEdit}
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
		</>
	);
}

function ConfigTypeCategorySection({
	form,
	onClearError,
}: {
	form: AppConfigFormApi;
	onClearError: () => void;
}) {
	return (
		<div className="grid grid-cols-2 gap-4">
			<form.Field name="value_type">
				{(field) => (
					<Field>
						<FieldLabel htmlFor={field.name}>Tipo de valor</FieldLabel>
						<Select
							value={field.state.value}
							onValueChange={(v) => {
								if (!v) return;
								const nextType = v as AppConfigValueType;
								field.handleChange(nextType);
								onClearError();
								coerceValueForType(form, nextType);
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
	);
}

interface ValueBranchProps {
	fieldName: string;
	value: FormValue;
	isInvalid: boolean;
	errors: ComponentProps<typeof FieldError>["errors"];
	onBlur: () => void;
	onChange: (value: FormValue) => void;
}

function BooleanValueInput({
	value,
	onChange,
}: Pick<ValueBranchProps, "value" | "onChange">) {
	const checked = Boolean(value);
	return (
		<Field>
			<FieldLabel>Valor</FieldLabel>
			<div className="flex items-center gap-3">
				<Switch id="value" checked={checked} onCheckedChange={onChange} />
				<Badge variant={checked ? "default" : "secondary"}>
					{checked ? "true" : "false"}
				</Badge>
			</div>
		</Field>
	);
}

function JsonValueInput({
	fieldName,
	value,
	isInvalid,
	errors,
	onBlur,
	onChange,
	onClearError,
}: ValueBranchProps & { onClearError: () => void }) {
	return (
		<Field data-invalid={isInvalid}>
			<FieldLabel htmlFor={fieldName}>Valor (JSON)</FieldLabel>
			<Textarea
				id={fieldName}
				name={fieldName}
				placeholder='["Quito","Guayaquil","Cuenca","Manta","Otra"]'
				rows={4}
				value={String(value ?? "")}
				onBlur={onBlur}
				onChange={(e) => {
					onClearError();
					onChange(e.target.value);
				}}
				aria-invalid={isInvalid}
				className="font-mono text-sm"
			/>
			<p className="text-xs text-muted-foreground">
				Debe ser JSON válido. Para ciudades usa un array de strings.
			</p>
			{isInvalid && <FieldError errors={errors} />}
		</Field>
	);
}

function TextValueInput({
	fieldName,
	value,
	valueType,
	isInvalid,
	errors,
	onBlur,
	onChange,
}: ValueBranchProps & { valueType: AppConfigValueType }) {
	return (
		<Field data-invalid={isInvalid}>
			<FieldLabel htmlFor={fieldName}>Valor</FieldLabel>
			<Input
				id={fieldName}
				name={fieldName}
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
				value={String(value ?? "")}
				onBlur={onBlur}
				onChange={(e) =>
					onChange(
						valueType === "number"
							? e.target.value === ""
								? ""
								: Number(e.target.value)
							: e.target.value,
					)
				}
				aria-invalid={isInvalid}
			/>
			{isInvalid && <FieldError errors={errors} />}
		</Field>
	);
}

function ConfigValueSection({
	form,
	valueType,
	onClearError,
}: {
	form: AppConfigFormApi;
	valueType: AppConfigValueType;
	onClearError: () => void;
}) {
	return (
		<form.Field name="value">
			{(field) => {
				const shared: ValueBranchProps = {
					fieldName: field.name,
					value: field.state.value,
					isInvalid: field.state.meta.isTouched && !field.state.meta.isValid,
					errors: field.state.meta.errors,
					onBlur: field.handleBlur,
					onChange: (next) => field.handleChange(next),
				};
				if (valueType === "boolean") {
					return (
						<BooleanValueInput
							value={shared.value}
							onChange={shared.onChange}
						/>
					);
				}
				if (valueType === "json") {
					return <JsonValueInput {...shared} onClearError={onClearError} />;
				}
				return <TextValueInput {...shared} valueType={valueType} />;
			}}
		</form.Field>
	);
}

function ConfigMetaSection({ form }: { form: AppConfigFormApi }) {
	return (
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
	);
}

function ConfigFlagsSection({ form }: { form: AppConfigFormApi }) {
	return (
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
	);
}

export function AppConfigForm({
	formId,
	onSuccess,
	config,
}: AppConfigFormProps) {
	const { form, error, clearError } = useAppConfigForm({ config, onSuccess });
	const valueType = form.state.values.value_type;
	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		e.stopPropagation();
		form.handleSubmit();
	};

	return (
		<form id={formId} onSubmit={handleSubmit} className="space-y-4">
			<ConfigFormError error={error} />
			<ConfigIdentitySection form={form} isEdit={Boolean(config)} />
			<ConfigTypeCategorySection form={form} onClearError={clearError} />
			<ConfigValueSection
				form={form}
				valueType={valueType}
				onClearError={clearError}
			/>
			<ConfigMetaSection form={form} />
			<ConfigFlagsSection form={form} />

			<p className="text-xs text-muted-foreground">
				Tipos disponibles: {APP_CONFIG_VALUE_TYPES.join(", ")}
			</p>
		</form>
	);
}
