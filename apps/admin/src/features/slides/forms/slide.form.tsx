import type {
	CreateSlideDto,
	SlideDto,
	SlideType,
	UpdateSlideDto,
} from "@0xc1x/role-commons";
import { CreateSlideFormSchema, RedirectUrlSchema } from "@0xc1x/role-commons";
import { useForm, useStore } from "@tanstack/react-form";
import { z } from "zod";
import { ImageField } from "@/components/media/image-field";
import { Badge } from "@/components/ui/badge";
import { ColorPicker } from "@/components/ui/color-picker";
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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ApiClientError } from "@/lib/api/errors";
import {
	useCreateSlide,
	useUpdateSlide,
	useUploadImage,
} from "../queries/slides.queries";

const SLIDE_TYPE_OPTIONS = [
	{ value: "ad", label: "Ad" },
	{ value: "tip", label: "Tip" },
	{ value: "info", label: "Info" },
	{ value: "sponsor", label: "Sponsor" },
	{ value: "coupon", label: "Coupon" },
] as const;

/** Coincide con HexColorSchema de role-commons (#RGB / #RRGGBB). */
const HEX_REGEX = /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/;

function emptyToNull(value: string | null | undefined): string | null {
	if (value == null || value === "") return null;
	return value;
}

const slideFormSchema = CreateSlideFormSchema.omit({
	image_url: true,
})
	.extend({
		image: z.custom<File | string | null>(),
		// Inputs del form usan "" para “sin valor”; el schema de commons espera null.
		badge_text: z
			.string()
			.max(30)
			.transform((v) => (v === "" ? null : v)),
		// El input del form usa "" para “sin valor”; commons lo representa como
		// null (RedirectUrlSchema.nullable()). Reusamos la validación de commons.
		redirect_url: z
			.string()
			.transform((v) => (v === "" ? null : v))
			.pipe(RedirectUrlSchema.nullable()),
		// Código del cupón (solo type === "coupon"); "" se trata como null.
		// Mismas reglas que coupon_code en role-commons (el .pipe no acepta
		// el envoltorio optional del schema de commons).
		coupon_code: z
			.string()
			.transform((v) => (v === "" ? null : v))
			.pipe(
				z
					.string()
					.min(1, "El código de cupón no puede estar vacío")
					.max(50, "El código de cupón no debe superar los 50 caracteres")
					.nullable(),
			),
		text_color: z
			.string()
			.refine((v) => v === "" || HEX_REGEX.test(v), {
				message:
					"El color debe tener un formato hexadecimal válido (ej. #FF0000)",
			})
			.transform((v) => (v === "" ? null : v)),
		button_color: z
			.string()
			.refine((v) => v === "" || HEX_REGEX.test(v), {
				message:
					"El color debe tener un formato hexadecimal válido (ej. #FF0000)",
			})
			.transform((v) => (v === "" ? null : v)),
		start_at: z.string().transform((v) => (v === "" ? null : v)),
		end_at: z.string().transform((v) => (v === "" ? null : v)),
		// El form siempre provee estos valores; quitamos optional de commons.
		active: z.boolean(),
		priority: z.number().int().min(0),
	})
	.superRefine((value, ctx) => {
		if (value.type === "coupon") {
			if (!value.coupon_code) {
				ctx.addIssue({
					code: "custom",
					path: ["coupon_code"],
					message: "Las slides de tipo cupón requieren un código",
				});
			}
		} else if (!value.redirect_url) {
			ctx.addIssue({
				code: "custom",
				path: ["redirect_url"],
				message: "El destino es obligatorio (URL externa o ruta interna /)",
			});
		}
	});

type SlideFormValues = z.input<typeof slideFormSchema>;

interface SlideFormProps {
	formId: string;
	onSuccess?: () => void;
	slide?: SlideDto;
}

export function SlideForm({ formId, onSuccess, slide }: SlideFormProps) {
	const createMutation = useCreateSlide();
	const updateMutation = useUpdateSlide();
	const uploadMutation = useUploadImage();

	const form = useForm({
		defaultValues: {
			title: slide?.title ?? "",
			caption: slide?.caption ?? "",
			badge_text: slide?.badge_text ?? "",
			cta_label: slide?.cta_label ?? "",
			redirect_url: slide?.redirect_url ?? "",
			coupon_code: slide?.coupon_code ?? "",
			text_color: slide?.text_color ?? "",
			button_color: slide?.button_color ?? "",
			type: slide?.type ?? "info",
			active: slide?.active ?? true,
			priority: slide?.priority ?? 0,
			start_at: slide?.start_at ?? "",
			end_at: slide?.end_at ?? "",
			image: (slide?.image_url ?? null) as File | string | null,
		} satisfies SlideFormValues,
		validators: { onSubmit: slideFormSchema },
		onSubmit: async ({ value }) => {
			let imageUrl: string | null = null;

			if (value.image instanceof File) {
				const { url } = await uploadMutation.mutateAsync(value.image);
				imageUrl = url;
			} else if (typeof value.image === "string") {
				imageUrl = value.image;
			}

			const payload = {
				title: value.title,
				caption: value.caption,
				badge_text: emptyToNull(value.badge_text as string | null | undefined),
				cta_label: value.cta_label,
				// Cupón: sin destino; los demás tipos: sin código.
				redirect_url:
					value.type === "coupon"
						? null
						: emptyToNull(value.redirect_url as string | null | undefined),
				coupon_code:
					value.type === "coupon"
						? emptyToNull(value.coupon_code as string | null | undefined)
						: null,
				text_color: emptyToNull(value.text_color as string | null | undefined),
				button_color: emptyToNull(
					value.button_color as string | null | undefined,
				),
				type: value.type,
				active: value.active ?? true,
				priority: value.priority ?? 0,
				start_at: emptyToNull(value.start_at as string | null | undefined),
				end_at: emptyToNull(value.end_at as string | null | undefined),
				image_url: imageUrl,
			};

			if (slide) {
				await updateMutation.mutateAsync({
					id: slide.id,
					body: payload as UpdateSlideDto,
				});
			} else {
				await createMutation.mutateAsync(payload as CreateSlideDto);
			}
			onSuccess?.();
		},
	});

	// Habilita el render condicional del CTA según el tipo elegido.
	const selectedType = useStore(form.store, (s) => s.values.type);

	const formError =
		createMutation.error ?? updateMutation.error ?? uploadMutation.error;

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

			<form.Field name="title">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<Field data-invalid={isInvalid}>
							<FieldLabel htmlFor={field.name}>Título</FieldLabel>
							<Input
								id={field.name}
								name={field.name}
								type="text"
								placeholder="Título del slide"
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

			<form.Field name="caption">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<Field data-invalid={isInvalid}>
							<FieldLabel htmlFor={field.name}>Caption</FieldLabel>
							<Input
								id={field.name}
								name={field.name}
								type="text"
								placeholder="Caption del slide"
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

			<form.Field name="badge_text">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<Field data-invalid={isInvalid}>
							<FieldLabel htmlFor={field.name}>Badge</FieldLabel>
							<Input
								id={field.name}
								name={field.name}
								type="text"
								placeholder="Texto del badge (opcional)"
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

			<form.Field name="type">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<Field data-invalid={isInvalid}>
							<FieldLabel htmlFor={field.name}>Tipo</FieldLabel>
							<Select
								value={field.state.value}
								onValueChange={(v) => {
									if (v) field.handleChange(v as SlideType);
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
									{SLIDE_TYPE_OPTIONS.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{isInvalid && <FieldError errors={field.state.meta.errors} />}
						</Field>
					);
				}}
			</form.Field>

			<form.Field name="cta_label">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<Field data-invalid={isInvalid}>
							<FieldLabel htmlFor={field.name}>Call to Action</FieldLabel>
							<Input
								id={field.name}
								name={field.name}
								type="text"
								placeholder="Texto del botón"
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

			{selectedType === "coupon" ? (
				<form.Field name="coupon_code">
					{(field) => {
						const isInvalid =
							field.state.meta.isTouched && !field.state.meta.isValid;
						return (
							<Field data-invalid={isInvalid}>
								<FieldLabel htmlFor={field.name}>Código del cupón</FieldLabel>
								<Input
									id={field.name}
									name={field.name}
									type="text"
									placeholder="Ej. ROLE10"
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
			) : (
				<form.Field name="redirect_url">
					{(field) => {
						const isInvalid =
							field.state.meta.isTouched && !field.state.meta.isValid;
						return (
							<Field data-invalid={isInvalid}>
								<FieldLabel htmlFor={field.name}>Destino</FieldLabel>
								<Input
									id={field.name}
									name={field.name}
									type="text"
									placeholder="https://... o /explore"
									value={field.state.value ?? ""}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									aria-invalid={isInvalid}
								/>
								<p className="text-xs text-muted-foreground">
									URL externa (https://...) o ruta interna de la app (ej.{" "}
									/explore).
								</p>
								{isInvalid && <FieldError errors={field.state.meta.errors} />}
							</Field>
						);
					}}
				</form.Field>
			)}

			<form.Field name="priority">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					const priority = field.state.value ?? 0;
					return (
						<Field data-invalid={isInvalid}>
							<FieldLabel htmlFor={field.name} className="flex justify-between">
								<span>Prioridad</span>
								<span className="text-muted-foreground tabular-nums">
									{priority}
								</span>
							</FieldLabel>
							<Slider
								id={field.name}
								value={[priority]}
								onValueChange={(v) => {
									const val = Array.isArray(v) ? v[0] : v;
									field.handleChange(val);
								}}
								min={0}
								max={10}
								step={1}
							/>
							{isInvalid && <FieldError errors={field.state.meta.errors} />}
						</Field>
					);
				}}
			</form.Field>

			<form.Field name="text_color">
				{(field) => {
					const rawValue = field.state.value ?? "";
					const hasFormatError =
						rawValue.length > 0 && !HEX_REGEX.test(rawValue);
					const formErrors = field.state.meta.errors ?? [];
					const isInvalid =
						(field.state.meta.isTouched && formErrors.length > 0) ||
						hasFormatError;

					return (
						<Field data-invalid={isInvalid} className="space-y-1.5">
							<div className="flex items-center justify-between">
								<FieldLabel htmlFor={field.name}>Color del texto</FieldLabel>
								{rawValue && (
									<span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground uppercase">
										{rawValue}
									</span>
								)}
							</div>
							<div
								className={
									isInvalid
										? "[&_button]:border-destructive [&_button]:ring-destructive/20"
										: undefined
								}
							>
								<ColorPicker
									value={rawValue || undefined}
									onChange={(val) => field.handleChange(val)}
									onBlur={field.handleBlur}
								/>
							</div>
							{isInvalid && (
								<p className="pt-0.5 text-xs font-medium text-destructive">
									{hasFormatError
										? "Formato hexadecimal inválido (ej. #3B82F6)."
										: null}
									{!hasFormatError && formErrors.length > 0 ? (
										<FieldError errors={formErrors} />
									) : null}
								</p>
							)}
						</Field>
					);
				}}
			</form.Field>

			<form.Field name="button_color">
				{(field) => {
					const rawValue = field.state.value ?? "";
					const hasFormatError =
						rawValue.length > 0 && !HEX_REGEX.test(rawValue);
					const formErrors = field.state.meta.errors ?? [];
					const isInvalid =
						(field.state.meta.isTouched && formErrors.length > 0) ||
						hasFormatError;

					return (
						<Field data-invalid={isInvalid} className="space-y-1.5">
							<div className="flex items-center justify-between">
								<FieldLabel htmlFor={field.name}>Color del botón</FieldLabel>
								{rawValue && (
									<span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground uppercase">
										{rawValue}
									</span>
								)}
							</div>
							<div
								className={
									isInvalid
										? "[&_button]:border-destructive [&_button]:ring-destructive/20"
										: undefined
								}
							>
								<ColorPicker
									value={rawValue || undefined}
									onChange={(val) => field.handleChange(val)}
									onBlur={field.handleBlur}
								/>
							</div>
							{isInvalid && (
								<p className="pt-0.5 text-xs font-medium text-destructive">
									{hasFormatError
										? "Formato hexadecimal inválido (ej. #3B82F6)."
										: null}
									{!hasFormatError && formErrors.length > 0 ? (
										<FieldError errors={formErrors} />
									) : null}
								</p>
							)}
						</Field>
					);
				}}
			</form.Field>

			<form.Field name="start_at">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<Field data-invalid={isInvalid}>
							<FieldLabel htmlFor={field.name}>Fecha de inicio</FieldLabel>
							<DateTimePicker
								value={field.state.value ?? ""}
								onChange={(v) => field.handleChange(v)}
								placeholder="Seleccionar inicio"
							/>
							{isInvalid && <FieldError errors={field.state.meta.errors} />}
						</Field>
					);
				}}
			</form.Field>

			<form.Field name="end_at">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<Field data-invalid={isInvalid}>
							<FieldLabel htmlFor={field.name}>
								Fecha de finalización
							</FieldLabel>
							<DateTimePicker
								value={field.state.value ?? ""}
								onChange={(v) => field.handleChange(v)}
								placeholder="Seleccionar fin"
							/>
							{isInvalid && <FieldError errors={field.state.meta.errors} />}
						</Field>
					);
				}}
			</form.Field>

			<form.Field name="image">
				{(field) => (
					<ImageField
						label="Imagen de la slide"
						currentFile={field.state.value}
						isInvalid={field.state.meta.isTouched && !field.state.meta.isValid}
						errors={field.state.meta.errors}
						onBlur={field.handleBlur}
						onChange={(file) => field.handleChange(file)}
					/>
				)}
			</form.Field>

			{slide && (
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
