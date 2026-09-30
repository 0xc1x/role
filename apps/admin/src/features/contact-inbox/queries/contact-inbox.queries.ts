import type { ListContactMessagesQuery } from "@0xc1x/role-commons";
import {
	keepPreviousData,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { notifyMutationError } from "@/lib/api/notify";
import { contactInboxApi } from "../api/contact-inbox.api";
import { contactInboxKeys } from "./contact-inbox.keys";

export function useContactInboxList(params?: ListContactMessagesQuery) {
	return useQuery(contactInboxListOptions(params));
}

export const contactInboxListOptions = (params?: ListContactMessagesQuery) =>
	queryOptions({
		queryKey: contactInboxKeys.list(params),
		queryFn: () => contactInboxApi.list(params),
		staleTime: 30_000,
		placeholderData: keepPreviousData,
	});

/** Detalle de un mensaje. `null` mientras el drawer está cerrado. */
export function useContactMessage(id: string | null) {
	return useQuery({
		queryKey: contactInboxKeys.detail(id ?? ""),
		queryFn: () => contactInboxApi.detail(id as string),
		enabled: id !== null,
	});
}

export function useMarkContactMessageHandled() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => contactInboxApi.markHandled(id),
		onSuccess: (message) => {
			// El listado y el detalle se invalidan juntos: marcar como atendido
			// cambia el estado que ve el operador en las dos superficies, y dejar
			// una de las dos con el valor viejo lo haría dudar de que guardó.
			void queryClient.invalidateQueries({
				queryKey: contactInboxKeys.lists(),
			});
			queryClient.setQueryData(contactInboxKeys.detail(message.id), message);
		},
		// Sin esto, un fallo al marcar era indistinguible de un click que no
		// se dispara, y el operador no tenía forma de reintentar a ciegas.
		onError: notifyMutationError,
	});
}
