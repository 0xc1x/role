import { AnnouncementListQuerySchema } from "@0xc1x/role-commons";
import { createFileRoute } from "@tanstack/react-router";
import { Megaphone, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { DataTable } from "@/components/data-table/data-table";
import { PageSkeleton } from "@/components/page-skeleton";
import { StatusFilter } from "@/components/status-filter";
import { Button } from "@/components/ui/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
import {
	AnnouncementCreateDrawer,
	announcementsColumns,
	useAnnouncementsList,
} from "@/features/announcements";
import { formatApiError } from "@/lib/api/notify";

// El contrato ya declara `search`, `severity` y `active`; el `.extend` solo baja
// el page size al de las tablas (10).
const announcementsSearchSchema = AnnouncementListQuerySchema.extend({
	limit: z.coerce.number().int().min(1).max(100).optional().default(10),
});

/** Los dos valores del filtro de vigencia, que en la URL son `active=true|false`. */
type EstadoFiltro = "vigente" | "inactivo";

const ESTADO_LABELS: Record<EstadoFiltro, string> = {
	vigente: "Vigentes",
	inactivo: "Inactivos",
};

/**
 * SIN `loader` A PROPÓSITO — el mismo motivo documentado en `_layout.consejos.tsx`,
 * `_layout.cupones.tsx` y `_layout.pagos.tsx`: con `loader: ensureQueryData(...)`
 * un fallo del API escapa al `errorComponent` de la ruta —que ninguna define— y
 * el panel entero se sustituye por el "Something went wrong!" de TanStack, sin el
 * mensaje y sin su "Reintentar".
 *
 * Y sin filtro de audiencia, porque no existe: `GET /announcements/admin` no
 * acepta `?audience=` y no hay que inventarse un filtro de página que la API no
 * puede responder. Quien es el destinatario se escribe al publicar, no se filtra
 * después.
 */
export const Route = createFileRoute("/_layout/anuncios")({
	validateSearch: (raw) => announcementsSearchSchema.parse(raw),
	component: RouteComponent,
	head: () => ({
		meta: [
			{ title: "Anuncios | Role" },
			{
				name: "description",
				content:
					"Gestiona los avisos de tu plataforma desde el panel de administración Role",
			},
		],
	}),
});

function RouteComponent() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data, isLoading, isError, error, refetch } =
		useAnnouncementsList(search);

	const [searchInput, setSearchInput] = useState(search.search ?? "");

	useEffect(() => {
		setSearchInput(search.search ?? "");
	}, [search.search]);

	useEffect(() => {
		const timer = setTimeout(() => {
			if (searchInput !== (search.search ?? "")) {
				navigate({
					search: {
						page: 1,
						limit: search.limit,
						search: searchInput || undefined,
						severity: search.severity,
						active: search.active,
					},
				});
			}
		}, 300);
		return () => clearTimeout(timer);
	}, [
		searchInput,
		search.search,
		search.limit,
		search.severity,
		search.active,
		navigate,
	]);

	// Cambiar un filtro vuelve a la página 1: quedarse en la página 4 de un filtro
	// nuevo muestra una lista vacía y parece que el filtro no encontró nada.
	const patch = (next: Partial<typeof search>) =>
		navigate({ search: { ...search, ...next, page: 1 } });

	if (isLoading) {
		return <PageSkeleton />;
	}

	if (isError) {
		return (
			<div className="px-6 py-4">
				<div className="flex flex-col items-center gap-4">
					<p className="text-destructive">
						{formatApiError(error, "Error al cargar anuncios")}
					</p>
					<Button variant="outline" onClick={() => void refetch()}>
						Reintentar
					</Button>
				</div>
			</div>
		);
	}

	const announcements = data?.data ?? [];
	const meta = data?.meta;

	return (
		<div className="px-6 py-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<header className="flex items-center gap-2">
					<Megaphone className="size-5 text-muted-foreground" />
					<h1 className="font-bold text-xl">Anuncios</h1>
				</header>
				<div className="flex flex-wrap items-center gap-3">
					<InputGroup className="max-w-sm">
						<InputGroupAddon align="inline-start">
							<Search className="size-4 text-muted-foreground" />
						</InputGroupAddon>
						<InputGroupInput
							placeholder="Buscar en título y cuerpo..."
							value={searchInput}
							onChange={(e) => setSearchInput(e.target.value)}
						/>
					</InputGroup>
					<StatusFilter
						value={search.severity}
						statuses={["info", "required"]}
						label={(s) => (s === "required" ? "Obligatorio" : "Informativo")}
						allLabel="Todas las severidades"
						ariaLabel="Severidad"
						onChange={(severity) => patch({ severity })}
					/>
					<StatusFilter<EstadoFiltro>
						value={
							search.active === undefined
								? undefined
								: search.active
									? "vigente"
									: "inactivo"
						}
						statuses={["vigente", "inactivo"]}
						label={(estado) => ESTADO_LABELS[estado]}
						allLabel="Todos los estados"
						ariaLabel="Estado"
						onChange={(estado) =>
							patch({
								active: estado === undefined ? undefined : estado === "vigente",
							})
						}
					/>
					<AnnouncementCreateDrawer />
				</div>
			</div>
			<div className="mt-4">
				<DataTable
					columns={announcementsColumns}
					data={announcements}
					meta={meta}
					onPageChange={(page) => navigate({ search: { ...search, page } })}
					onLimitChange={(limit) =>
						navigate({ search: { ...search, page: 1, limit } })
					}
				/>
			</div>
		</div>
	);
}
