import type {
	BusinessVerificationStatus,
	EmailSendStatus,
	PayoutStatus,
} from "@0xc1x/role-commons";

/**
 * Etiquetas en español de los enums que la API entrega en inglés.
 *
 * El back office es 100% español: mostrar `approved` o `paid` crudo obliga al
 * operador a traducir en la cabeza, y un estado de pago mal leído es un estado de
 * pago mal pagado. Las claves son los valores del contrato (`commons`), así que
 * un enum nuevo rompe el compilador en vez de caer en un `undefined` silencioso.
 */

const BUSINESS_VERIFICATION_LABELS: Record<BusinessVerificationStatus, string> =
	{
		pending: "Pendiente",
		approved: "Aprobado",
		rejected: "Rechazado",
	};

const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
	pending: "Pendiente",
	processing: "Procesando",
	paid: "Pagado",
	failed: "Fallido",
};

const EMAIL_SEND_STATUS_LABELS: Record<EmailSendStatus, string> = {
	pending: "Pendiente",
	queued: "En cola",
	processing: "Procesando",
	sent: "Enviado",
	delivered: "Entregado",
	opened: "Abierto",
	clicked: "Clic",
	bounced: "Rebotado",
	complained: "Marcado como spam",
	failed: "Fallido",
	cancelled: "Cancelado",
};

/** Verificación de negocio: `approved` → "Aprobado". */
export const businessVerificationLabel = (status: string): string =>
	BUSINESS_VERIFICATION_LABELS[status as BusinessVerificationStatus] ?? status;

/** Estado de corte de pago: `paid` → "Pagado". */
export const payoutStatusLabel = (status: string): string =>
	PAYOUT_STATUS_LABELS[status as PayoutStatus] ?? status;

/** Estado de un envío de correo: `bounced` → "Rebotado". */
export const emailSendStatusLabel = (status: string): string =>
	EMAIL_SEND_STATUS_LABELS[status as EmailSendStatus] ?? status;
