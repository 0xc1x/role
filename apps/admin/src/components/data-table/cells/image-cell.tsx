import { useRef, useState } from "react";
import { Loader2, Pencil, UploadCloud, X } from "lucide-react";
import { usePreviewUrl } from "@/components/media/image-field";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ImageThumbnail } from "@/components/media/image-thumbnail";

interface ImageCellProps {
	imageUrl: string | null;
	name: string;
	onSave: (file: File | null) => Promise<void>;
}

export function ImageCell({ imageUrl, name, onSave }: ImageCellProps) {
	const [open, setOpen] = useState(false);
	const [file, setFile] = useState<File | string | null>(imageUrl);
	const [isPending, setIsPending] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const previewUrl = usePreviewUrl(file);

	const hasChanges = file instanceof File || file !== imageUrl;

	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen) setFile(imageUrl);
		setOpen(nextOpen);
	};

	const handleSave = async () => {
		setIsPending(true);
		try {
			await onSave(file instanceof File ? file : null);
			setOpen(false);
		} finally {
			setIsPending(false);
		}
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger
				render={
					<button
						type="button"
						className="rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				}
			>
				{imageUrl ? (
					<ImageThumbnail src={imageUrl} alt={name} />
				) : (
					<span className="group flex h-10 w-10 items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/20 transition hover:bg-muted/50 hover:border-primary/40">
						<UploadCloud className="size-4 text-muted-foreground transition group-hover:text-primary" />
					</span>
				)}
			</PopoverTrigger>

			<PopoverContent className="w-72 space-y-3" align="start">
				<p className="text-sm font-medium">
					Imagen de <span className="text-muted-foreground">{name}</span>
				</p>

				{previewUrl ? (
					<div className="relative flex h-56 w-full items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
						<img
							src={previewUrl}
							alt={`Vista previa de ${name}`}
							className="h-full w-full object-contain"
						/>
						<button
							type="button"
							aria-label="Quitar imagen"
							onClick={() => setFile(null)}
							className="absolute top-2 right-2 rounded-full bg-background/80 p-1 shadow-sm transition hover:bg-background"
						>
							<X className="size-3.5" />
						</button>
					</div>
				) : (
					<div className="relative flex h-40 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/20 transition hover:bg-muted/50">
						<input
							type="file"
							accept="image/*"
							className="absolute inset-0 z-10 cursor-pointer opacity-0"
							onChange={(e) => {
								const newFile = e.target.files?.[0] || null;
								if (newFile) setFile(newFile);
							}}
						/>
						<UploadCloud className="mb-2 size-6 text-muted-foreground" />
						<p className="text-xs font-medium text-foreground">
							Selecciona o arrastra una imagen
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							PNG, JPG o WEBP hasta 5MB
						</p>
					</div>
				)}

				{previewUrl && (
					<>
						<input
							ref={inputRef}
							type="file"
							accept="image/*"
							className="hidden"
							onChange={(e) => {
								const newFile = e.target.files?.[0] || null;
								if (newFile) setFile(newFile);
								e.target.value = "";
							}}
						/>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="w-full"
							disabled={isPending}
							onClick={() => inputRef.current?.click()}
						>
							<Pencil className="size-3.5" />
							Reemplazar imagen
						</Button>
					</>
				)}

				<div className="flex justify-end gap-2 pt-1">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={isPending}
						onClick={() => setOpen(false)}
					>
						Cancelar
					</Button>
					<Button
						type="button"
						size="sm"
						disabled={isPending || !hasChanges}
						onClick={handleSave}
					>
						{isPending ? (
							<>
								<Loader2 className="size-4 animate-spin" />
								Guardando...
							</>
						) : (
							"Guardar"
						)}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
