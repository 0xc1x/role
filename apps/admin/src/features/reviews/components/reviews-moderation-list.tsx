import type {
	ListReviewsForModerationQuery,
	ReviewModerationItemDto,
	ReviewModerationReason,
	ReviewVisibility,
} from "@0xc1x/role-commons";
import {
	REVIEW_MODERATION_REASON_LABELS,
	REVIEW_MODERATION_REASONS,
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
 * Los filtros viven en la URL (los recibe la ruta), no en estado local: es lo
 * que hace que "volver a mostrar" y después recargar no devuelva al operador a
 * una lista que ya no corresponde con lo que hizo.
 */
export function ReviewsModerationList({
	page = 1,
	limit = 20,
	visibility = "all",
	businessId,
	rating,
	moderationReason,
	onPageChange,
	onFilterChange,
}: {
	page?: number;
	limit?: number;
	visibility?: ReviewVisibility;
	businessId?: string;
	rating?: number;
	moderationReason?: ReviewModerationReason;
	onPageChange: (page: number) => void;
	onFilterChange: (filters: {
		visibility?: ReviewVisibility;
		business_id?: string;
		rating?: number;
		moderation_reason?: ReviewModerationReason;
	}) => void;
}) {
	const { data, isLoading, isError, error, refetch } = useReviewsModerationList(
		{
			page,
			limit,
			visibility,
			business_id: businessId,
			rating,
			moderation_reason: moderationReason,
		} satisfies ListReviewsForModerationQuery,
	);
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
				<Button variant="outline" onClick={() => refetch()}>
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
							moderation_reason: moderationReason,
						})
					}
				>
					<SelectTrigger className="w-44" aria-label="Visibilidad">
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
							moderation_reason: moderationReason,
						})
					}
				>
					<SelectTrigger className="w-36" aria-label="Puntaje">
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
				{/* El filtro por motivo es el que da sentido a la taxonomía: sin él,
				    declararla solo serviría para etiquetar filas que nadie puede
				    encontrar después. El selector se arma desde el contrato, así que
				    un motivo nuevo aparece sin tocar esta vista. */}
				<Select
					value={moderationReason ?? "all"}
					onValueChange={(v) =>
						onFilterChange({
							visibility,
							business_id: businessId,
							rating,
							moderation_reason:
								v === "all" ? undefined : (v as ReviewModerationReason),
						})
					}
				>
					<SelectTrigger className="w-56" aria-label="Motivo">
						<SelectValue placeholder="Motivo" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Cualquier motivo</SelectItem>
						{REVIEW_MODERATION_REASONS.map((reason) => (
							<SelectItem key={reason} value={reason}>
								{REVIEW_MODERATION_REASON_LABELS[reason]}
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
				onConfirm={(cuerpo) =>
					hideMutation.mutate(
						{ id: ocultando?.id ?? "", ...cuerpo },
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
				moderationReason={mostrando?.moderation_reason ?? null}
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
