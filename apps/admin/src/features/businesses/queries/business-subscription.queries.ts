import type { UpdateBusinessSubscriptionDto } from "@0xc1x/role-commons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { businessSubscriptionApi } from "../api/business-subscription.api";
import { businessSubscriptionKeys } from "./business-subscription.keys";
import { businessesKeys } from "./businesses.keys";

/**
 * El plan del negocio.
 *
 * `staleTime` corto a propósito: el plan lo asigna la plataforma a mano, y el
 * operador lo mira para SUPERVISAR. Una caché larga mostraría un plan que
 * ya cambió —o que se le acaba de asignar— con la misma seguridad con la que
 * muestra el resto del panel.
 *
 * El id `null` es la forma de "no hay negocio": la consulta no se dispara, y
 * es lo que permite gatear la pestaña por la pestaña activa sin que la
 * inactiva pida nada.
 */
export function useBusinessSubscription(id: string | null) {
	return useQuery({
		queryKey: businessSubscriptionKeys.detail(id ?? ""),
		queryFn: () => businessSubscriptionApi.get(id as string),
		enabled: Boolean(id),
		staleTime: 5_000,
	});
}

/**
 * El catálogo de planes: lo que está en oferta, con sus topes y sus features.
 *
 * Lo lee el plan de UN negocio —la pestaña muestra la oferta completa para
 * que el operador elija sin salir de la ficha—, así que viaja gateado por la
 * misma bandera que el resto de la pestaña: si nadie está mirando el plan, el
 * catálogo no se pide.
 *
 * La caché es larga porque el catálogo cambia por migración, no por acción del
 * operador: nadie lo edita desde el panel.
 */
export function useBusinessPlans(enabled = true) {
	return useQuery({
		queryKey: businessSubscriptionKeys.plans(),
		queryFn: () => businessSubscriptionApi.plans(),
		enabled,
		staleTime: 60_000,
	});
}

/**
 * La asignación del plan: la plataforma se lo pone al negocio con la mano.
 *
 * Al terminar invalida la suscripción —lo que cambió— y el detalle del
 * negocio: el plan es parte de cómo se ve ese negocio en el panel, y una ficha
 * que conserva el plan de antes no sirve para verificar la asignación.
 */
export function useUpdateBusinessSubscription(businessId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: businessSubscriptionKeys.detail(businessId),
		mutationFn: (body: UpdateBusinessSubscriptionDto) =>
			businessSubscriptionApi.update(businessId, body),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: businessSubscriptionKeys.detail(businessId),
			});
			void queryClient.invalidateQueries({
				queryKey: businessesKeys.detail(businessId),
			});
		},
	});
}
