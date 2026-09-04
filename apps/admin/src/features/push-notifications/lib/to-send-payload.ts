import { CreatePushSendSchema } from "@0xc1x/role-commons";
import type { SendFormValues } from "../forms/push-forms";

/**
 * Valores del formulario → payload de `POST /push-notifications/send`,
 * validado con el schema de commons. Lanza ZodError si falta audiencia
 * o exceden límites; el caller muestra el mensaje.
 */
export function toSendPayload(values: SendFormValues) {
	return CreatePushSendSchema.parse({
		title: values.title,
		body: values.body,
		type: values.type,
		data: values.link ? { link: values.link } : undefined,
		segment_ids: values.segment_ids,
		include_user_ids: values.include_user_ids,
		exclude_user_ids: values.exclude_user_ids,
	});
}

/** Indica si la selección actual tiene audiencia (para habilitar botones). */
export function hasAudience(
	values: Pick<SendFormValues, "segment_ids" | "include_user_ids">,
) {
	return values.segment_ids.length > 0 || values.include_user_ids.length > 0;
}
