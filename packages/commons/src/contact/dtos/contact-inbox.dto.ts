import type { z } from "zod";
import type { PaginatedData } from "../../_common/dtos/api.dto";
import type {
	ContactMessageDetailSchema,
	ContactMessageListItemSchema,
	ContactMessageListResponseSchema,
	ListContactMessagesQuerySchema,
} from "../schemas/contact-inbox.schema";

/** Fila del listado de la bandeja de contactos (admin). */
export type ContactMessageListItemDto = z.infer<
	typeof ContactMessageListItemSchema
>;

/** Detalle de un mensaje: listado + cuerpo del mensaje + IP de origen. */
export type ContactMessageDetailDto = z.infer<
	typeof ContactMessageDetailSchema
>;

export type ListContactMessagesQuery = z.infer<
	typeof ListContactMessagesQuerySchema
>;

export type ContactMessagePaginatedData =
	PaginatedData<ContactMessageListItemDto>;

export type ContactMessageListResponse = z.infer<
	typeof ContactMessageListResponseSchema
>;
