import type {
	BugReportDetailDto,
	BugTriageState,
	ListBugReportsQuery,
} from "@0xc1x/role-commons";
import {
	keepPreviousData,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { notifyMutationError } from "@/lib/api/notify";
import { bugReportApi } from "../api/bug-reports.api";
import { bugReportKeys } from "./bug-reports.keys";

export function useBugReportList(params?: ListBugReportsQuery) {
	return useQuery(bugReportListOptions(params));
}

export const bugReportListOptions = (params?: ListBugReportsQuery) =>
	queryOptions({
		queryKey: bugReportKeys.list(params),
		queryFn: () => bugReportApi.list(params),
		staleTime: 30_000,
		// Paginación sin salto de skeleton: la página 2 entra con la 1 todavía
		// en pantalla, que es lo mismo que hace la bandeja de contactos. Sin esto,
		// cada cambio de página vacía la tabla y el operador pierde de vista qué
		// estaba mirando.
		placeholderData: keepPreviousData,
	});

/** Detalle de un reporte. `null` mientras el drawer está cerrado. */
export function useBugReport(id: string | null) {
	return useQuery({
		queryKey: bugReportKeys.detail(id ?? ""),
		queryFn: () => bugReportApi.detail(id as string),
		enabled: id !== null,
	});
}

export function useSetBugReportState() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			id,
			state,
		}: {
			id: string;
			state: BugTriageState;
		}): Promise<BugReportDetailDto> => bugReportApi.setState(id, state),
		onSuccess: (reporte) => {
			// El listado y el detalle se invalidan juntos: el triaje cambia lo que
			// el operador ve en las dos superficies, y con el filtro por `state` la
			// fila puede SALIR de la página que está mirando. Dejar solo una de las
			// dos con el valor viejo lo haría dudar de que guardó.
			void queryClient.invalidateQueries({ queryKey: bugReportKeys.lists() });
			// Y el detalle se siembra con la respuesta, no con un parche: el PATCH
			// devuelve el detalle entero —con `image_urls` firmadas de nuevo— y
			// parchar solo `state` dejaría las capturas del drawer con las URLs
			// viejas, ya vencidas.
			queryClient.setQueryData(bugReportKeys.detail(reporte.id), reporte);
		},
		// Sin esto, un fallo al triajar era indistinguible de un click que no se
		// dispara, y el operador no tenía forma de reintentar a ciegas ni de darle
		// nada a soporte.
		onError: notifyMutationError,
	});
}
