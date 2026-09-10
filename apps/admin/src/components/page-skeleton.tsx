import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton compartido de páginas de listado (título + acción + tabla). */
export function PageSkeleton() {
	return (
		<div className="px-6 py-4 space-y-4">
			<div className="flex items-center justify-between">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-10 w-32" />
			</div>
			<Skeleton className="h-6 w-24" />
			<div className="space-y-2">
				{[1, 2, 3, 4, 5].map((n) => (
					<Skeleton key={n} className="h-12 w-full" />
				))}
			</div>
		</div>
	);
}
