import { ListReviewsForModerationQuerySchema } from "@0xc1x/role-commons";
import { createFileRoute } from "@tanstack/react-router";
import { ReviewsModerationList } from "@/features/reviews";
import { reviewsModerationListOptions } from "@/features/reviews/queries/reviews.queries";

/**
 * Moderación de reseñas públicas.
 *
 * El filtro vive en la URL y no en estado local a propósito: moderar y después
 * recargar tiene que devolver al operador la misma lista que estaba mirando. Con
 * el filtro en `useState`, un F5 después de "volver a mostrar" lo deja en la
 * lista completa y da la impresión de que la acción no se guardó.
 */
export const Route = createFileRoute("/_layout/resenas")({
	validateSearch: (raw) => ListReviewsForModerationQuerySchema.parse(raw),
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		context.queryClient.ensureQueryData(reviewsModerationListOptions(deps)),
	component: RouteComponent,
	head: () => ({
		meta: [
			{ title: "Reseñas | Rolé" },
			{
				name: "description",
				content: "Moderación de las reseñas públicas de los negocios",
			},
		],
	}),
});

function RouteComponent() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		<div className="px-6 py-4">
			<header className="flex items-center">
				<h1 className="font-bold text-xl">Reseñas</h1>
			</header>
			<p className="mt-1 text-muted-foreground text-sm">
				Las reseñas se ocultan, no se borran. Al ocultarlas dejan de verse en la
				página del negocio y en el móvil, y de contar en su promedio, pero la
				reseña se conserva: la persona no puede volver a publicar la misma, y
				queda registrado quién la ocultó y por qué.
			</p>
			<div className="mt-4">
				<ReviewsModerationList
					page={search.page}
					limit={search.limit}
					visibility={search.visibility}
					businessId={search.business_id}
					rating={search.rating}
					onPageChange={(page) => navigate({ search: { ...search, page } })}
					onFilterChange={(filters) =>
						navigate({
							search: {
								...search,
								visibility: filters.visibility ?? search.visibility,
								business_id: filters.business_id,
								rating: filters.rating,
								page: 1,
							},
						})
					}
				/>
			</div>
		</div>
	);
}
