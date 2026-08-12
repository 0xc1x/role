import { UploadCloud, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import {
	Attachment,
	AttachmentAction,
	AttachmentActions,
	AttachmentContent,
	AttachmentDescription,
	AttachmentMedia,
	AttachmentTitle,
} from "@/components/ui/attachment";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";

function formatFileSize(bytes: number) {
	if (bytes === 0) return "0 Bytes";
	const k = 1024;
	const sizes = ["Bytes", "KB", "MB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

export function usePreviewUrl(file: File | string | null) {
	const isFile = file instanceof File;
	const url = useMemo(() => {
		if (!file) return null;
		if (isFile) return URL.createObjectURL(file);
		return file;
	}, [file, isFile]);

	useEffect(() => {
		return () => {
			if (url && isFile) URL.revokeObjectURL(url);
		};
	}, [url, isFile]);

	return url;
}

export interface ImageFieldProps {
	/** Archivo actualmente seleccionado, URL existente, o null si no hay ninguno. */
	currentFile: File | string | null;
	/** Si el campo está en estado inválido (tocado + con errores). */
	isInvalid: boolean;
	/** Errores de validación a mostrar. */
	errors: ({ message?: string } | undefined)[];
	/** Handler de blur del campo. */
	onBlur: () => void;
	/** Handler de cambio: recibe el archivo nuevo o null al quitarlo. */
	onChange: (file: File | null) => void;
	/** Label del campo. Por defecto "Imagen de la Categoría". */
	label?: string;
	/** Input id/htmlFor. Por defecto "image-upload". */
	id?: string;
}

/**
 * Campo de subida de imagen con dropzone + preview.
 *
 * Es un componente real (no un render-prop) a propósito: usa el hook
 * useObjectUrl internamente, y los hooks de React necesitan vivir en un
 * componente con identidad estable para no romper el orden de llamada
 * entre renders. Si esto se declarara como children={(field) => {...}}
 * dentro de un form.Field, el hook quedaría a merced de cómo la librería
 * de formularios invoca esa función, lo cual puede disparar el error de
 * "Rendered fewer/more hooks than expected".
 */
export function ImageField({
	currentFile,
	isInvalid,
	errors,
	onBlur,
	onChange,
	label = "Imagen de la Categoría",
	id = "image-upload",
}: ImageFieldProps) {
	const isFile = currentFile instanceof File;
	const previewUrl = usePreviewUrl(currentFile);

	return (
		<Field data-invalid={isInvalid}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>

			{!currentFile ? (
				<div className="relative group flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-muted-foreground/20 rounded-lg hover:bg-muted/50 transition cursor-pointer">
					<input
						id={id}
						type="file"
						accept="image/*"
						className="absolute inset-0 opacity-0 cursor-pointer z-10"
						onBlur={onBlur}
						onChange={(e) => {
							const file = e.target.files?.[0] || null;
							onChange(file);
						}}
					/>
					<div className="flex flex-col items-center justify-center p-4 text-center">
						<UploadCloud className="h-8 w-8 text-muted-foreground group-hover:text-primary transition mb-2" />
						<p className="text-sm font-medium text-foreground">
							Selecciona o arrastra una imagen
						</p>
						<p className="text-xs text-muted-foreground mt-1">
							PNG, JPG o WEBP hasta 5MB
						</p>
					</div>
				</div>
			) : (
				<Attachment orientation="horizontal">
					<AttachmentMedia variant="image">
						{previewUrl && <img src={previewUrl} alt="Vista previa" />}
					</AttachmentMedia>
					<AttachmentContent>
						<AttachmentTitle>
							{isFile ? currentFile.name : "Imagen actual"}
						</AttachmentTitle>
						{isFile && (
							<AttachmentDescription>
								{formatFileSize(currentFile.size)}
							</AttachmentDescription>
						)}
					</AttachmentContent>
					<AttachmentActions>
						<AttachmentAction
							aria-label="Eliminar imagen"
							onClick={() => onChange(null)}
						>
							<X />
						</AttachmentAction>
					</AttachmentActions>
				</Attachment>
			)}

			{isInvalid && <FieldError errors={errors} />}
		</Field>
	);
}
