import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton de lista para pestañas (4 filas). */
export function Loading() {
	return (
		<output aria-label="Cargando" className="block space-y-2">
			{[1, 2, 3, 4].map((n) => (
				<Skeleton key={n} className="h-10 w-full" />
			))}
		</output>
	);
}
