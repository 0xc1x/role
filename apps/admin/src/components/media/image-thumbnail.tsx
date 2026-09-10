import { ImageOff } from "lucide-react";
import { useState } from "react";
import { AttachmentMedia } from "@/components/ui/attachment";
import { cn } from "@/lib/utils";

export interface ImageThumbnailProps {
	/** URL de la imagen a mostrar. */
	src: string;
	/** Texto alternativo (usualmente el nombre de la categoría/producto). */
	alt: string;
	/** Tamaño del thumbnail en px. Por defecto 40 (10 en escala Tailwind). */
	size?: number;
	/** Clases adicionales para el contenedor raíz. */
	className?: string;
}

/**
 * Thumbnail custom para mostrar una imagen ya alojada (URL), como en una
 * celda de tabla. A diferencia de ImagePreview, no maneja File/object URLs:
 * acá la imagen ya tiene una URL final, así que solo se renderiza.
 *
 * Si la imagen falla al cargar (link roto, 404), cae a un ícono de
 * placeholder en vez de mostrar el ícono roto por defecto del navegador.
 */
export function ImageThumbnail({
	src,
	alt,
	size = 40,
	className,
}: ImageThumbnailProps) {
	const [hasError, setHasError] = useState(false);

	return (
		<AttachmentMedia
			variant="image"
			className={cn("size-10", className)}
			style={{ width: size, height: size }}
		>
			{hasError ? (
				<span className="flex h-full w-full items-center justify-center">
					<ImageOff className="h-4 w-4 text-muted-foreground" />
				</span>
			) : (
				<img
					src={src}
					alt={alt}
					className="h-full w-full object-cover"
					onError={() => setHasError(true)}
				/>
			)}
		</AttachmentMedia>
	);
}
