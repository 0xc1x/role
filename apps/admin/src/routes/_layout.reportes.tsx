import {
	BUG_TRIAGE_STATES,
	ENTRY_ORIGINS,
	type ListBugReportsQuery,
	ListBugReportsQuerySchema,
} from "@0xc1x/role-commons";
import { createFileRoute } from "@tanstack/react-router";
import { BugReportsList, ReportesError } from "@/features/bug-reports";

/**
 * `state` y `origin` se limpian ANTES del parseo, y no con un `catch` sobre el
 * schema entero.
 *
 * POR QUÉ ESTA RUTA Y NO LAS OTRAS TRECE. Un `?state=REABIERTO` revienta
 * `validateSearch`, el router lo envuelve en `SearchParamError` y REEMPLAZA LA
 * PÁGINA ENTERA por el "Something went wrong!" de TanStack Router: sin barra
 * lateral, sin sección, sin el "Reintentar" del componente. El patrón de las
 * otras trece rutas tiene ese mismo hueco, así que esto no es una regresión —
 * pero en esta sección el token malo NO es una hipótesis, es un hecho que el
 * propio contrato declara: `app_store.state` es `text` sin CHECK, el mapper lo
 * estrecha a `null` sin lanzar, y el diseño dice que `null` significa "sin
 * triar" *o* "estado desconocido". El siguiente triageo natural de un operador
 * —"¿por qué esta fila dice Sin triar?"— lleva a copiar un token en la URL.
 *
 * `catch` sobre el schema entero habría sido peor que el problema: tragándose
 * un `?page=0` o un `?limit=999` inválidos los convertiría en los defaults
 * silenciosamente, que es un agujero distinto con la misma forma.
 *
 * `find` y no un `as`: es la misma disciplina del mapper de la API. Un token
 * fuera del vocabulario se traduce en "sin ese filtro", que es la única lectura
 * honesta — y no en un tipo mentiroso que el resto del panel acabaría creyendo.
 *
 * Y lo que NO se limpia: `page` y `limit` siguen tirando si vienen mal. Son
 * filtros que el operador no escribe a mano y un error ahí sí vale la página
 * en blanco, que es lo que hacen las otras trece rutas.
 */
function soloDelVocabulario<T extends string>(
	valor: unknown,
	vocabulario: readonly T[],
): T | undefined {
	return typeof valor === "string"
		? vocabulario.find((conocido) => conocido === valor)
		: undefined;
}

// Exportado para que el spec de la ruta pueda probarlo sin montar el router, que
// necesita un contexto completo. No es parte de la superficie de la sección:
// quien consume la UI importa desde `@/features/bug-reports`.
export function parseBugReportsSearch(
	raw: Record<string, unknown>,
): ListBugReportsQuery {
	return ListBugReportsQuerySchema.parse({
		...raw,
		state: soloDelVocabulario(raw.state, BUG_TRIAGE_STATES),
		origin: soloDelVocabulario(raw.origin, ENTRY_ORIGINS),
	});
}

/**
 * Buzón de los reportes de error que envía la app móvil.
 *
 * SIN `loader: ensureQueryData(...)` A PROPÓSITO, por el mismo motivo
 * documentado en `_layout.contactos.tsx` y `_layout.resenas.tsx`: un `loader`
 * corre antes de que el componente renderice, así que si la consulta falla el
 * error se escapa al `errorComponent` de la ruta en vez de entrar a la rama
 * `isError` de `BugReportsList`. Medido en el hermano de contactos: con
 * `/contact-inbox` en 500, el panel entero quedaba sustituido por el
 * "Something went wrong!" de TanStack Router, sin barra lateral y sin el
 * "Reintentar" del componente.
 *
 * Esta ruta SÍ define `errorComponent`, y es la primera: ver `ReportesError`, que
 * es la primera vez que el panel acota un error de RENDER en vez de uno de red.
 * La razón de que las otras trece no lo hagan es que su único error posible era
 * de red, y ese entra por el componente.
 *
 * La columna se llama "Triaje" y el listado NO trae la de entrega. `state` dice
 * qué hizo el equipo con el reporte; `delivery_status` lo mueve el camino
 * público de `POST /contact` cuando entrega el correo de aviso, y un reporte de
 * errores no tiene ese camino (D8): nadie lo mueve después del insert, así que
 * su "Entrega pendiente" sería eterno y el operador lo leería como una tarea
 * pendiente que ya no existe. La prosa de abajo dice lo mismo, porque una columna
 * sin leyenda se puede leer mal igual.
 */
export const Route = createFileRoute("/_layout/reportes")({
	validateSearch: (raw) => parseBugReportsSearch(raw),
	component: RouteComponent,
	errorComponent: ReportesError,
	head: () => ({
		meta: [
			{ title: "Reportes | Rolé" },
			{
				name: "description",
				content: "Errores que reportaron las personas desde la app de Rolé",
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
				<h1 className="font-bold text-xl">Reportes</h1>
			</header>
			<p className="mt-1 text-muted-foreground text-sm">
				Errores que las personas reportaron desde la app. La columna "Triaje"
				dice qué hizo el equipo con el reporte —abierto, en reproducción,
				corregido, duplicado o descartado—, no si se notificó a alguien: en esta
				bandeja no se manda ningún aviso, así que no hay estado de entrega que
				mirar.
			</p>
			<div className="mt-4">
				<BugReportsList
					page={search.page}
					limit={search.limit}
					state={search.state}
					origin={search.origin}
					onPageChange={(page) => navigate({ search: { ...search, page } })}
					// El `limit` entra en la URL y no se descarta. Sin esto, elegir
					// "50 filas" solo saltaba a la página 1 con el mismo tamaño de
					// página: el control funcionaba y no hacía nada.
					onLimitChange={(limit) =>
						navigate({ search: { ...search, limit, page: 1 } })
					}
					onFilterChange={(filtros) =>
						navigate({
							search: {
								...search,
								state: filtros.state,
								origin: filtros.origin,
								// Un filtro nuevo con la página 3 puesta mostraría una
								// lista vacía que el operador lee como "no hay
								// reportes" cuando sí hay. Se vuelve a la primera, como
								// en las demás rutas con filtro.
								page: 1,
							},
						})
					}
				/>
			</div>
		</div>
	);
}
