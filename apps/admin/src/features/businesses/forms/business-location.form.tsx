import type { BusinessLocationDto } from "@0xc1x/role-commons";
import {
	CreateBusinessLocationSchema,
	UpdateBusinessLocationSchema,
} from "@0xc1x/role-commons";
import { useForm, type ValidationError } from "@tanstack/react-form";
import { useMemo, type ChangeEvent } from "react";
import { z } from "zod";
import { useReportDrawerPending } from "@/components/resource/resource-drawer";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, getApiFieldErrors } from "@/lib/api/errors";
import { formatApiError } from "@/lib/api/notify";
import {
	useCreateBusinessLocation,
	useUpdateBusinessLocation,
} from "../queries/businesses.queries";

/**
 * El contrato define `latitude`/`longitude` como `z.number()`, pero el input es
 * texto: un `number` en el estado del form no puede representar el "" o el "-"
 * intermedios de quien escribe "-0.18", y el value de un input controlado lo
 * lee siempre como string. Por eso el form valida el TEXTO y convierte a número
 * recién en `onSubmit`, igual que `commission.form.tsx` con el porcentaje.
 *
 * El rango sí es validación propia y no duplicada: el contrato solo dice
 * `z.number()` y la columna es `numeric(10,7)`. Un texto libre aceptaría
 * "Cañaral" y el operador lo descubriría en un 422 del servidor.
 */
const coordinateField = (label: string, min: number, max: number) =>
	z
		.string()
		.trim()
		.min(1, `Ingresa la ${label}`)
		.refine((value) => !Number.isNaN(Number(value)), `Ingresa un número`)
		.refine(
			(value) => Number(value) >= min && Number(value) <= max,
			`La ${label} debe estar entre ${min} y ${max}`,
		);

/**
 * El form valida con SU schema (texto, para lo que se escribe) y el body sale
 * del schema del contrato. Las dos capas son necesarias: la primera da el error
 * en el campo, la segunda garantiza que lo que sale por la red cumple el
 * contrato antes de pedirlo — y el servidor sigue siendo la autoridad.
 */
const locationFormSchema = z.object({
	name: z.string().trim().min(1, "Ingresa el nombre del punto de retiro"),
	address: z.string().trim().min(1, "Ingresa la dirección"),
	// Opcionales en el contrato (`nullable`): "" se convierte a `null` al
	// construir el body, no hace falta una regla extra aquí.
	phone: z.string().trim(),
	zone: z.string().trim(),
	latitude: coordinateField("latitud", -90, 90),
	longitude: coordinateField("longitud", -180, 180),
	is_active: z.boolean(),
	is_headquarter: z.boolean(),
});

type LocationFormValues = z.input<typeof locationFormSchema>;

/**
 * `ValidationError` es `unknown` en el contrato de TanStack Form, y `FieldError`
 * quiere `{ message?: string }`. El puente va AQUÍ, en el borde, y no con un
 * `as`: un error que no traiga `message` se descarta en vez de romperse.
 */
function clientErrors(
	errors: ValidationError[],
): Array<{ message?: string } | undefined> {
	return errors.filter(
		(error): error is { message?: string } =>
			typeof error === "object" &&
			error !== null &&
			typeof (error as { message?: unknown }).message === "string",
	);
}

/**
 * Un campo de texto del form, con su error de servidor y su error de validación.
 *
 * Los ocho campos del form se veían como ocho copias de este bloque, y cada copia
 * tenía que acertar el mismo trío (error del servidor, `isInvalid`, cuándo
 * mostrar `FieldError`). El campo tiene identidad propia —"el nombre", "la
 * dirección"— y el trío es SU regla, no la del form: por eso vive aquí y no
 * repetido ocho veces.
 *
 * `control` existe porque nombre/dirección usan `Textarea` y el resto `Input`.
 */
function TextField({
	id,
	name,
	label,
	placeholder,
	value,
	onChange,
	onBlur,
	isTouched,
	isValid,
	errors,
	serverError,
	control = "input",
	inputMode,
}: {
	id: string;
	name: string;
	label: string;
	placeholder: string;
	value: string;
	onChange: (value: string) => void;
	onBlur: () => void;
	isTouched: boolean;
	isValid: boolean;
	errors: ValidationError[];
	serverError?: string;
	control?: "input" | "textarea";
	inputMode?: "decimal";
}) {
	const isInvalid = (isTouched && !isValid) || Boolean(serverError);

	return (
		<Field data-invalid={isInvalid}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			{control === "textarea" ? (
				<Textarea
					id={id}
					name={name}
					placeholder={placeholder}
					value={value}
					aria-invalid={isInvalid}
					onBlur={onBlur}
					onChange={(e) => onChange(e.target.value)}
				/>
			) : (
				<Input
					id={id}
					name={name}
					inputMode={inputMode}
					placeholder={placeholder}
					value={value}
					aria-invalid={isInvalid}
					onBlur={onBlur}
					onChange={(e: ChangeEvent<HTMLInputElement>) =>
						onChange(e.target.value)
					}
				/>
			)}
			{serverError ? (
				<FieldError errors={[{ message: serverError }]} />
			) : (
				isTouched && !isValid && <FieldError errors={clientErrors(errors)} />
			)}
		</Field>
	);
}

/** Campos del form: los `path` de `details[]` que se pueden asociar a un input. */
const FORM_FIELDS = [
	"name",
	"address",
	"phone",
	"zone",
	"latitude",
	"longitude",
	"is_active",
	"is_headquarter",
] as const;

export function BusinessLocationForm({
	formId,
	businessId,
	businessName,
	location,
	onSuccess,
}: {
	formId: string;
	businessId: string;
	businessName: string;
	/** Ausente = alta; presente = edición de ese punto de retiro. */
	location?: BusinessLocationDto;
	onSuccess?: () => void;
}) {
	const isEditing = Boolean(location);
	const createMutation = useCreateBusinessLocation(businessId);
	const updateMutation = useUpdateBusinessLocation(businessId);
	const mutation = isEditing ? updateMutation : createMutation;
	useReportDrawerPending(mutation.isPending);

	const form = useForm({
		defaultValues: {
			name: location?.name ?? "",
			address: location?.address ?? "",
			phone: location?.phone ?? "",
			zone: location?.zone ?? "",
			latitude: location ? String(location.latitude) : "",
			longitude: location ? String(location.longitude) : "",
			is_active: location?.is_active ?? true,
			is_headquarter: location?.is_headquarter ?? false,
		} as LocationFormValues,
		validators: { onSubmit: locationFormSchema },
		onSubmit: async ({ value }) => {
			// Texto → número: el contrato de la red habla `z.number()`.
			const coordinates = {
				latitude: Number(value.latitude),
				longitude: Number(value.longitude),
			};
			const shared = {
				name: value.name,
				address: value.address,
				phone: value.phone || null,
				zone: value.zone || null,
				...coordinates,
				is_active: value.is_active,
				is_headquarter: value.is_headquarter,
			};

			try {
				if (location) {
					// El PATCH es parcial y no lleva `business_id`: el schema de
					// actualización lo omite a propósito.
					await updateMutation.mutateAsync({
						locationId: location.id,
						body: UpdateBusinessLocationSchema.parse(shared),
					});
				} else {
					await createMutation.mutateAsync(
						CreateBusinessLocationSchema.parse({
							...shared,
							// El POST exige `business_id` en el cuerpo además del
							// `businessId` del path: sin él la API responde 422.
							business_id: businessId,
						}),
					);
				}
			} catch {
				// El error se pinta en el campo que falló: dejarlo propagar sería
				// un unhandled rejection sin nada que mostrar.
				return;
			}
			onSuccess?.();
		},
	});

	const formError = mutation.error;
	const fieldErrors = useMemo(() => getApiFieldErrors(formError), [formError]);
	const unmappedErrors = useMemo(() => {
		if (!(formError instanceof ApiClientError)) return [];
		// Un 422 de `ZodValidationPipe` trae `details[{ path, message }]`. Si
		// alguno corresponde a un campo de este form, esos mensajes ya dicen qué
		// corregir y el general solo los repetiría; si no, el mensaje general se
		// sigue mostrando. `formatApiError` le concatena el `requestId`.
		if (!formError.details) return [formatApiError(formError)];
		const mapped = FORM_FIELDS.some((field) => field in fieldErrors);
		return mapped ? [] : [formatApiError(formError)];
	}, [formError, fieldErrors]);

	/**
	 * Cuando el 422 sí se repartió en los campos, `unmappedErrors` queda vacío y
	 * con él se iría el `requestId`: el operador vería QUÉ corregir pero no
	 * podría correlacionar el fallo con el log del servidor. Por eso el
	 * `requestId` se muestra aparte en ese caso, y no se duplica cuando el
	 * mensaje general ya lo lleva.
	 */
	const requestId = useMemo(() => {
		if (!(formError instanceof ApiClientError)) return undefined;
		if (unmappedErrors.length > 0) return undefined;
		return formError.requestId;
	}, [formError, unmappedErrors]);

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
			<p className="text-muted-foreground text-sm">
				{isEditing ? "Editas" : "Agregas"} el punto de retiro a {businessName}.
				Las coordenadas son las que usa el cliente para ordenar los puntos de
				retiro por distancia.
			</p>
			{unmappedErrors.map((message) => (
				<p key={message} className="text-sm text-destructive">
					{message}
				</p>
			))}
			{requestId ? (
				<p className="text-muted-foreground text-sm">
					Referencia para soporte: {requestId}
				</p>
			) : null}

			<form.Field name="name">
				{(field) => (
					<TextField
						id={`${formId}-name`}
						name={field.name}
						label="Nombre del punto de retiro"
						placeholder="Sucursal del centro"
						value={field.state.value}
						onChange={field.handleChange}
						onBlur={field.handleBlur}
						isTouched={field.state.meta.isTouched}
						isValid={field.state.meta.isValid}
						errors={field.state.meta.errors}
						serverError={fieldErrors.name}
					/>
				)}
			</form.Field>

			<form.Field name="address">
				{(field) => (
					<TextField
						id={`${formId}-address`}
						name={field.name}
						label="Dirección"
						placeholder="Av. principal 123, barrio centro"
						value={field.state.value}
						onChange={field.handleChange}
						onBlur={field.handleBlur}
						isTouched={field.state.meta.isTouched}
						isValid={field.state.meta.isValid}
						errors={field.state.meta.errors}
						serverError={fieldErrors.address}
						control="textarea"
					/>
				)}
			</form.Field>

			<div className="grid gap-4 sm:grid-cols-2">
				<form.Field name="latitude">
					{(field) => (
						<TextField
							id={`${formId}-latitude`}
							name={field.name}
							label="Latitud"
							placeholder="-0.1807"
							value={field.state.value}
							onChange={field.handleChange}
							onBlur={field.handleBlur}
							isTouched={field.state.meta.isTouched}
							isValid={field.state.meta.isValid}
							errors={field.state.meta.errors}
							serverError={fieldErrors.latitude}
							inputMode="decimal"
						/>
					)}
				</form.Field>

				<form.Field name="longitude">
					{(field) => (
						<TextField
							id={`${formId}-longitude`}
							name={field.name}
							label="Longitud"
							placeholder="-78.4678"
							value={field.state.value}
							onChange={field.handleChange}
							onBlur={field.handleBlur}
							isTouched={field.state.meta.isTouched}
							isValid={field.state.meta.isValid}
							errors={field.state.meta.errors}
							serverError={fieldErrors.longitude}
							inputMode="decimal"
						/>
					)}
				</form.Field>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<form.Field name="phone">
					{(field) => (
						<TextField
							id={`${formId}-phone`}
							name={field.name}
							label="Teléfono (opcional)"
							placeholder="+593 99 123 4567"
							value={field.state.value}
							onChange={field.handleChange}
							onBlur={field.handleBlur}
							isTouched={field.state.meta.isTouched}
							isValid={field.state.meta.isValid}
							errors={field.state.meta.errors}
							serverError={fieldErrors.phone}
						/>
					)}
				</form.Field>

				<form.Field name="zone">
					{(field) => (
						<TextField
							id={`${formId}-zone`}
							name={field.name}
							label="Zona (opcional)"
							placeholder="Centro"
							value={field.state.value}
							onChange={field.handleChange}
							onBlur={field.handleBlur}
							isTouched={field.state.meta.isTouched}
							isValid={field.state.meta.isValid}
							errors={field.state.meta.errors}
							serverError={fieldErrors.zone}
						/>
					)}
				</form.Field>
			</div>

			<form.Field name="is_active">
				{(field) => (
					<Field className="flex flex-row items-center gap-3">
						<Switch
							id={`${formId}-is_active`}
							checked={field.state.value}
							onCheckedChange={field.handleChange}
						/>
						<FieldLabel htmlFor={`${formId}-is_active`}>
							Activo — visible para los clientes
						</FieldLabel>
					</Field>
				)}
			</form.Field>

			<form.Field name="is_headquarter">
				{(field) => (
					<Field className="flex flex-row items-center gap-3">
						<Switch
							id={`${formId}-is_headquarter`}
							checked={field.state.value}
							onCheckedChange={field.handleChange}
						/>
						<FieldLabel htmlFor={`${formId}-is_headquarter`}>
							Es la sede principal
						</FieldLabel>
					</Field>
				)}
			</form.Field>
		</form>
	);
}
