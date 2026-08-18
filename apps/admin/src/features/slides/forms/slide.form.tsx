import type {
	CreateSlideDto,
	SlideDto,
	SlideType,
	UpdateSlideDto,
} from "@0xc1x/role-commons";
import { CreateSlideFormSchema } from "@0xc1x/role-commons";
import { useForm } from "@tanstack/react-form";
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
] as const;

/** Coincide con HexColorSchema de role-commons (#RGB / #RRGGBB). */
const HEX_REGEX = /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/;

function emptyToNull(value: string | null | undefined): string | null {
	if (value == null || value === "") return null;
	return value;
}

const slideFormSchema = CreateSlideFormSchema.omit({
	image_url: true,
}).extend({
	image: z.custom<File | string | null>(),
	// Inputs del form usan "" para “sin valor”; el schema de commons espera null.
	badge_text: z
		.string()
		.max(30)
		.transform((v) => (v === "" ? null : v)),
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
				redirect_url: value.redirect_url,
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

			<form.Field
				name="title"
				children={(field) => {
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
			/>

			<form.Field
				name="caption"
				children={(field) => {
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
			/>

			<form.Field
				name="badge_text"
				children={(field) => {
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
			/>

			<form.Field
				name="cta_label"
				children={(field) => {
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
			/>

			<form.Field
				name="redirect_url"
				children={(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<Field data-invalid={isInvalid}>
							<FieldLabel htmlFor={field.name}>URL de redirección</FieldLabel>
							<Input
								id={field.name}
								name={field.name}
								type="url"
								placeholder="https://..."
								value={field.state.value ?? ""}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								aria-invalid={isInvalid}
							/>
							{isInvalid && <FieldError errors={field.state.meta.errors} />}
						</Field>
					);
				}}
			/>

			<form.Field
				name="type"
				children={(field) => {
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
			/>

			<form.Field
				name="priority"
				children={(field) => {
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
			/>

			<form.Field
				name="text_color"
				children={(field) => {
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
			/>

			<form.Field
				name="button_color"
				children={(field) => {
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
			/>

			<form.Field
				name="start_at"
				children={(field) => {
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
			/>

			<form.Field
				name="end_at"
				children={(field) => {
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
			/>

			<form.Field
				name="image"
				children={(field) => (
					<ImageField
						label="Imagen de la slide"
						currentFile={field.state.value}
						isInvalid={field.state.meta.isTouched && !field.state.meta.isValid}
						errors={field.state.meta.errors}
						onBlur={field.handleBlur}
						onChange={(file) => field.handleChange(file)}
					/>
				)}
			/>

			{slide && (
				<form.Field
					name="active"
					children={(field) => {
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
				/>
			)}
		</form>
	);
}
