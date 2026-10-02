import type {
	BugTriageState,
	BusinessVerificationStatus,
	ContactDeliveryStatus,
	EmailSendStatus,
	EntryOrigin,
	OrderStatus,
	PayoutStatus,
	ReviewModerationReason,
	ReviewVisibility,
} from "@0xc1x/role-commons";
import { REVIEW_MODERATION_REASON_LABELS } from "@0xc1x/role-commons";

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

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
	pending: "Pendiente",
	confirmed: "Confirmada",
	ready_for_pickup: "Lista para recoger",
	picked_up: "Recogida",
	completed: "Completada",
	cancelled: "Cancelada",
	expired: "Vencida",
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

/** Estado de una orden: `ready_for_pickup` → "Lista para recoger". */
export const orderStatusLabel = (status: string): string =>
	ORDER_STATUS_LABELS[status as OrderStatus] ?? status;

/**
 * Estado de entrega del aviso de un mensaje de la bandeja de contactos.
 *
 * Los valores del enum ya vienen en español, pero se renombran igual porque la
 * palabra original miente: `delivery_status` en `app_store` lo mueve el camino
 * público de `POST /contact` cuando se ENTREGA el correo de notificación, no
 * cuando alguien lee el mensaje. Poner "Pendiente"/"Procesado" a secas haría
 * leer "pendiente" como "sin leer" y "procesado" como "ya atendido", que es
 * exactamente el malentendido que la columna induce.
 */
const CONTACT_DELIVERY_STATUS_LABELS: Record<ContactDeliveryStatus, string> = {
	PENDIENTE: "Entrega pendiente",
	PROCESADO: "Notificado",
	ERROR: "Error",
};

export const contactDeliveryStatusLabel = (status: string): string =>
	CONTACT_DELIVERY_STATUS_LABELS[status as ContactDeliveryStatus] ?? status;

/**
 * Estado del TRIAGE de un reporte de error: qué hizo el equipo con el reporte.
 *
 * NO es el eje de entrega. `delivery_status` contesta "¿llegó el aviso al
 * equipo?" y este contesta "¿qué hizo el equipo con el reporte?": un reporte
 * `CORREGIDO` no dice nada sobre la entrega, y una entrega que nadie espera
 * (D8: no hay camino de correo) no dice nada sobre el bug. Se etiquetan por
 * separado y en columnas separadas justamente para que no se confundan.
 *
 * `?? state` y no "Sin triar" como fallback: el token crudo ES la información
 * cuando el panel no lo conoce. `state` es `text` sin CHECK en Postgres, así
 * que un `'REABIERTO'` escrito a mano o por un script llega al panel como lo
 * que es — y el mapper de la API lo estrecha a `null` antes, así que en la
 * práctica esta rama es la red que agarra un token nuevo antes de que se
 * publique. Lo que NO puede hacer es tapar el dato con una etiqueta de relleno
 * que el operador leería como un triaje real.
 */
const BUG_TRIAGE_STATE_LABELS: Record<BugTriageState, string> = {
	ABIERTO: "Abierto",
	EN_REPRODUCCION: "En reproducción",
	CORREGIDO: "Corregido",
	DUPLICADO: "Duplicado",
	DESCARTADO: "Descartado",
};

export const bugTriageStateLabel = (state: string): string =>
	BUG_TRIAGE_STATE_LABELS[state as BugTriageState] ?? state;

/**
 * Canal por el que llegó el reporte.
 *
 * Los tokens son platform names (`ios`, `android`, `pwa`, `web`) y no hay nada
 * que traducir: "iOS" y "Android" se escriben igual en español que en inglés.
 * Lo que sí cambia es la mayúscula inicial, que en el contrato va en minúsculas
 * y en una columna del panel se leería como un valor sin terminar.
 *
 * `?? origin` por el mismo motivo que el resto del archivo: un token fuera del
 * enum se muestra crudo en vez de inventarle un nombre.
 */
const ENTRY_ORIGIN_LABELS: Record<EntryOrigin, string> = {
	ios: "iOS",
	android: "Android",
	pwa: "PWA",
	web: "Web",
};

export const entryOriginLabel = (origin: string): string =>
	ENTRY_ORIGIN_LABELS[origin as EntryOrigin] ?? origin;

/**
 * Filtro de visibilidad de la bandeja de reseñas.
 *
 * "hidden" NO se etiqueta "Eliminadas": la reseña se conserva y se puede volver a
 * mostrar. Decir "eliminada" haría que el operador creyera que la fila ya no
 * existe y que su motivo queda sin destinatario.
 */
const REVIEW_VISIBILITY_LABELS: Record<ReviewVisibility, string> = {
	all: "Todas las reseñas",
	hidden: "Ocultas",
	visible: "Visibles",
};

export const reviewVisibilityLabel = (visibility: string): string =>
	REVIEW_VISIBILITY_LABELS[visibility as ReviewVisibility] ?? visibility;

/**
 * Etiqueta en español del motivo de moderación.
 *
 * Reusa el mapa del contrato en vez de re-declararlo acá: la etiqueta es la
 * MISMA que se le ofrece al operador en el selector del diálogo, y dos listas
 * que se pueden desincronizar son la forma de que el motivo que se elige no sea
 * el que se muestra en la fila.
 *
 * `?? reason` y no "Motivo desconocido": un token que el contrato de hoy no
 * conoce es un caso real —un motivo retirado del contrato con reseñas ya
 * moderadas— y mostrar el token crudo es honesto. Un texto de relleno
 * escondería que la fila dice algo que el panel ya no sabe nombrar.
 */
export const reviewModerationReasonLabel = (reason: string): string =>
	REVIEW_MODERATION_REASON_LABELS[reason as ReviewModerationReason] ?? reason;
