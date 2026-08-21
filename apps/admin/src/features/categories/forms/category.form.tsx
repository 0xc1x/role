import { type CategoryDto, CreateCategorySchema } from "@0xc1x/role-commons";
import { useForm } from "@tanstack/react-form";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { useTheme } from "next-themes";
import { z } from "zod";
import { ImageField } from "@/components/media/image-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { ApiClientError } from "@/lib/api/errors";
import {
	useCreateCategory,
	useUpdateCategory,
	useUploadImage,
} from "../queries/categories.queries";

const categoryFormSchema = CreateCategorySchema.omit({
	image_url: true,
}).extend({
	image: z.custom<File | string | null>(),
});
type CategoryFormValues = z.input<typeof categoryFormSchema>;

interface CategoryFormProps {
	formId: string;
	onSuccess?: () => void;
	category?: CategoryDto;
}

export function CategoryForm({
	formId,
	onSuccess,
	category,
}: CategoryFormProps) {
	const { resolvedTheme } = useTheme();
	const createMutation = useCreateCategory();
	const updateMutation = useUpdateCategory();
	const uploadMutation = useUploadImage();
	const form = useForm({
		defaultValues: {
			name: category?.name ?? "",
			description: category?.description ?? "",
			slug: category?.slug ?? "",
			emoji: category?.emoji ?? "",
			active: category?.active ?? true,
			image: (category?.image_url ?? null) as File | string | null,
		} as CategoryFormValues,
		validators: { onSubmit: categoryFormSchema },
		onSubmit: async ({ value }) => {
			let imageUrl: string | null = null;

			if (value.image instanceof File) {
				const { url } = await uploadMutation.mutateAsync(value.image);
				imageUrl = url;
			} else if (typeof value.image === "string") {
				imageUrl = value.image;
			}

			const payload = {
				name: value.name,
				description: value.description || null,
				slug: value.slug || undefined,
				emoji: value.emoji || null,
				image_url: imageUrl,
				active: value.active ?? true,
			};

			if (category) {
				await updateMutation.mutateAsync({ id: category.id, body: payload });
			} else {
				await createMutation.mutateAsync(payload);
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

			<form.Field name="name">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<Field data-invalid={isInvalid}>
							<FieldLabel htmlFor={field.name}>Nombre</FieldLabel>
							<Input
								id={field.name}
								name={field.name}
								type="text"
								placeholder="Nombre de la categoría"
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

			<form.Field name="description">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<Field data-invalid={isInvalid}>
							<FieldLabel htmlFor={field.name}>Descripción</FieldLabel>
							<Input
								id={field.name}
								name={field.name}
								type="text"
								placeholder="Descripción de la categoría"
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

			<form.Field name="slug">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<Field data-invalid={isInvalid}>
							<FieldLabel htmlFor={field.name}>Slug</FieldLabel>
							<Input
								id={field.name}
								name={field.name}
								type="text"
								placeholder="slug-de-la-categoria"
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

			<form.Field name="emoji">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<Field data-invalid={isInvalid}>
							<FieldLabel>Emoji de la categoría</FieldLabel>
							<div className="flex items-center gap-3">
								<Popover>
									<PopoverTrigger
										render={
											<Button
												type="button"
												variant="outline"
												className="w-14 h-14 rounded-full text-2xl p-0 flex items-center justify-center leading-none select-none"
											/>
										}
									>
										{field.state.value || "✨"}
									</PopoverTrigger>
									<PopoverContent
										className="p-0 border-none w-full"
										align="start"
									>
										<EmojiPicker
											theme={
												resolvedTheme === "dark" ? Theme.DARK : Theme.LIGHT
											}
											onEmojiClick={(emojiData) => {
												field.handleChange(emojiData.emoji);
											}}
											previewConfig={{ showPreview: false }}
											height={350}
										/>
									</PopoverContent>
								</Popover>
								<span className="text-sm text-muted-foreground">
									Haz clic en el círculo para cambiar el emoji
								</span>
							</div>
							{isInvalid && <FieldError errors={field.state.meta.errors} />}
						</Field>
					);
				}}
			</form.Field>

			<form.Field name="image">
				{(field) => (
					<ImageField
						currentFile={field.state.value}
						isInvalid={field.state.meta.isTouched && !field.state.meta.isValid}
						errors={field.state.meta.errors}
						onBlur={field.handleBlur}
						onChange={(file) => field.handleChange(file)}
					/>
				)}
			</form.Field>

			{category && (
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
