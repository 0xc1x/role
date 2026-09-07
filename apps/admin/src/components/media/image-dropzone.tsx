import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

const IMAGE_HINT_ID = "image-dropzone-hint";

/** Dropzone compartido (ImageField + ImageCell): mismo copy, mismo input overlay. */
export function ImageDropzone(props: {
	id: string;
	inputLabel: string;
	className?: string;
	onBlur?: () => void;
	onSelect: (file: File | null) => void;
}) {
	return (
		<div
			className={cn(
				"group relative flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/20 transition hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring",
				props.className ?? "h-32",
			)}
		>
			<input
				id={props.id}
				type="file"
				accept="image/*"
				aria-label={props.inputLabel}
				aria-describedby={IMAGE_HINT_ID}
				className="absolute inset-0 z-10 cursor-pointer opacity-0"
				onBlur={props.onBlur}
				onChange={(e) => {
					props.onSelect(e.target.files?.[0] ?? null);
					e.target.value = "";
				}}
			/>
			<div className="flex flex-col items-center justify-center p-4 text-center">
				<UploadCloud className="mb-2 h-8 w-8 text-muted-foreground transition group-hover:text-primary" />
				<p className="text-sm font-medium text-foreground">
					Selecciona o arrastra una imagen
				</p>
				<p id={IMAGE_HINT_ID} className="mt-1 text-xs text-muted-foreground">
					PNG, JPG o WEBP hasta 5MB
				</p>
			</div>
		</div>
	);
}
