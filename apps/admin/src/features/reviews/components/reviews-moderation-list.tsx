import type {
	ListReviewsForModerationQuery,
	ReviewModerationItemDto,
	ReviewVisibility,
} from "@0xc1x/role-commons";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { HideReviewDialog } from "@/features/reviews/components/hide-review-dialog";
import { UnhideReviewDialog } from "@/features/reviews/components/unhide-review-dialog";
import {
	useHideReview,
	useReviewsModerationList,
	useUnhideReview,
} from "@/features/reviews/queries/reviews.queries";
import { createReviewModerationColumns } from "@/features/reviews/tables/reviews.columns";
import { formatApiError } from "@/lib/api/notify";
import { reviewVisibilityLabel } from "@/lib/labels";

/**
 * Bandeja de moderación de reseñas.
 *
 * El filtro por visibilidad vive en la URL (lo recibe la ruta), no en estado
 * local: es lo que hace que "volver a mostrar" y después recargar no devuelva al
 * operador a una lista que ya no corresponde con lo que hizo.
 */
export function ReviewsModerationList({
	page = 1,
	limit = 20,
	visibility = "all",
	businessId,
	rating,
	onPageChange,
	onFilterChange,
}: {
	page?: number;
	limit?: number;
	visibility?: ReviewVisibility;
	businessId?: string;
	rating?: number;
	onPageChange: (page: number) => void;
	onFilterChange: (filters: {
		visibility?: ReviewVisibility;
		business_id?: string;
		rating?: number;
	}) => void;
}) {
	const { data, isLoading, isError, error } = useReviewsModerationList({
		page,
		limit,
		visibility,
		business_id: businessId,
		rating,
	} satisfies ListReviewsForModerationQuery);
	const hideMutation = useHideReview();
	const unhideMutation = useUnhideReview();
	const [ocultando, setOcultando] = useState<ReviewModerationItemDto | null>(
		null,
	);
	const [mostrando, setMostrando] = useState<ReviewModerationItemDto | null>(
		null,
	);

	const columnas = useMemo(
		() => createReviewModerationColumns(setOcultando, setMostrando),
		[],
	);

	if (isLoading) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-8 w-48" />
				{[1, 2, 3, 4, 5].map((n) => (
					<Skeleton key={n} className="h-12 w-full" />
				))}
			</div>
		);
	}

	if (isError) {
		return (
			<div className="space-y-4">
				<p className="text-destructive">
					{formatApiError(error, "No se pudieron cargar las reseñas")}
				</p>
				<Button variant="outline" onClick={() => onPageChange(1)}>
					Reintentar
				</Button>
			</div>
		);
	}

	const filas = data?.data ?? [];

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-end gap-2">
				<Select
					value={visibility}
					onValueChange={(v) =>
						onFilterChange({
							visibility: v as ReviewVisibility,
							business_id: businessId,
							rating,
						})
					}
				>
					<SelectTrigger className="w-44">
						<SelectValue placeholder="Visibilidad" />
					</SelectTrigger>
					<SelectContent>
						{(["all", "hidden", "visible"] as const).map((v) => (
							<SelectItem key={v} value={v}>
								{reviewVisibilityLabel(v)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					value={rating ? String(rating) : "all"}
					onValueChange={(v) =>
						onFilterChange({
							visibility,
							business_id: businessId,
							rating: v === "all" ? undefined : Number(v),
						})
					}
				>
					<SelectTrigger className="w-36">
						<SelectValue placeholder="Puntaje" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Cualquier puntaje</SelectItem>
						{[1, 2, 3, 4, 5].map((n) => (
							<SelectItem key={n} value={String(n)}>
								{n} estrella{n === 1 ? "" : "s"}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{filas.length === 0 ? (
				<p className="text-muted-foreground py-8 text-center text-sm">
					No hay reseñas con este filtro.
				</p>
			) : (
				<DataTable
					columns={columnas}
					data={filas}
					meta={data?.meta}
					onPageChange={onPageChange}
					onLimitChange={() => onPageChange(1)}
				/>
			)}

			<HideReviewDialog
				open={ocultando !== null}
				onOpenChange={(open) => {
					if (!open) {
						setOcultando(null);
						hideMutation.reset();
					}
				}}
				isPending={hideMutation.isPending}
				authorName={ocultando?.author_name ?? null}
				businessName={ocultando?.business_name ?? null}
				comment={ocultando?.comment ?? null}
				onConfirm={(razon) =>
					hideMutation.mutate(
						{ id: ocultando?.id ?? "", reason: razon },
						{ onSuccess: () => setOcultando(null) },
					)
				}
			/>

			<UnhideReviewDialog
				open={mostrando !== null}
				onOpenChange={(open) => {
					if (!open) {
						setMostrando(null);
						unhideMutation.reset();
					}
				}}
				isPending={unhideMutation.isPending}
				authorName={mostrando?.author_name ?? null}
				hiddenReason={mostrando?.hidden_reason ?? null}
				onConfirm={() =>
					unhideMutation.mutate(mostrando?.id ?? "", {
						onSuccess: () => setMostrando(null),
					})
				}
			/>
		</div>
	);
}
