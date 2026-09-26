import { z } from "zod";
import { TimestamptzSchema, UuidSchema } from "../../_common/schemas/common";
import { EMAIL_SEND_STATUSES } from "../../email/enums/email.enum";

/**
 * Proyección de solo lectura de un envío transaccional encolado para un
 * negocio (avisos de aprobación/rechazo). El operador necesita destinatario,
 * plantilla, resultado y marcas de tiempo; el resto de `email_sends` es interno.
 */
export const BusinessEmailSendSchema = z.object({
	id: UuidSchema,
	email: z.email(),
	template_name: z.string().min(1),
	status: z.enum(EMAIL_SEND_STATUSES),
	error_message: z.string().nullable(),
	created_at: TimestamptzSchema,
	updated_at: TimestamptzSchema,
});

/** Respuesta de `GET /businesses/:id/email-sends`. */
export const BusinessEmailSendListResponseSchema = z.array(
	BusinessEmailSendSchema,
);
