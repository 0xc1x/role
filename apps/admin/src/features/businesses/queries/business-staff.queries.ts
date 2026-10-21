import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { businessStaffApi } from "../api/business-staff.api";
import { businessStaffKeys } from "./business-staff.keys";

/**
 * El roster del equipo del negocio.
 *
 * `staleTime` corto a propósito: el roster cambia por acciones del dueño y del
 * gerente, y el panel lo mira para SUPERVISAR. Una caché larga mostraría un
 * equipo que ya no existe —o, peor, uno al que se le acaba de cortar el
 * acceso— con la misma seguridad con la que muestra el resto del panel.
 *
 * El id `null` es la forma de "no hay negocio": la consulta no se dispara, y
 * es lo que permite gatear la tabla por pestaña sin que la pestaña inactiva
 * pida nada.
 */
export function useBusinessStaff(id: string | null) {
	return useQuery({
		queryKey: businessStaffKeys.list(id ?? ""),
		queryFn: () => businessStaffApi.list(id as string),
		enabled: Boolean(id),
		staleTime: 5_000,
	});
}

/**
 * El corte de emergencia: todos los accesos del negocio, de una vez.
 *
 * Al terminar invalida SOLO la lista del roster de ese negocio: el corte no
 * cambia los datos del negocio ni los de los negocios, y arrastrar esas
 * invalidaciones a «todo el panel» sería pedir refetches que nadie está
 * mirando.
 */
export function useRevokeBusinessAccess(businessId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: businessStaffKeys.list(businessId),
		mutationFn: () => businessStaffApi.revokeAll(businessId),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: businessStaffKeys.list(businessId),
			});
		},
	});
}
