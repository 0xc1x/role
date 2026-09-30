import type {
	ContactMessageDetailDto,
	ContactMessagePaginatedData,
	ListContactMessagesQuery,
} from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";
import { toSearchParams } from "@/lib/api/http";

/**
 * A mano y no con `createResourceApi`: la bandeja no tiene create ni delete
 * (un mensaje del público no se borra desde el panel), y exponerlos como
 * `never` dejaría el agujero disponible en el helper compartido.
 */
const base = "/contact-inbox";

export const contactInboxApi = {
	list: (query?: ListContactMessagesQuery) =>
		api.get<ContactMessagePaginatedData>(
			`${base}${toSearchParams(query as Record<string, unknown> | undefined)}`,
		),
	detail: (id: string) => api.get<ContactMessageDetailDto>(`${base}/${id}`),
	/**
	 * "Atendido" no es un cuerpo: es una transición de estado en el servidor
	 * (`PATCH /:id/handled`). Por eso no hay `body` — un payload aquí sugeriría
	 * que el estado se elige desde el cliente, y no es así.
	 */
	markHandled: (id: string) =>
		api.patch<ContactMessageDetailDto>(`${base}/${id}/handled`),
};
