import { X } from "lucide-react";
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
import { ImageDropzone } from "./image-dropzone";

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
	/** Label del campo. Por defecto "Imagen". */
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
	label = "Imagen",
	id = "image-upload",
}: ImageFieldProps) {
	const isFile = currentFile instanceof File;
	const previewUrl = usePreviewUrl(currentFile);

	return (
		<Field data-invalid={isInvalid}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>

			{!currentFile ? (
				<ImageDropzone
					id={id}
					inputLabel={`${label}: seleccionar imagen`}
					className="h-32"
					onBlur={onBlur}
					onSelect={(file) => onChange(file)}
				/>
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
