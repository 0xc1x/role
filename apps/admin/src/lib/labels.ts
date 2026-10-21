import type {
	AudienceKind,
	BugTriageState,
	BusinessFeature,
	BusinessMemberRole,
	BusinessMemberStatus,
	BusinessPlanCode,
	BusinessVerificationStatus,
	ContactDeliveryStatus,
	EmailSendStatus,
	EntryOrigin,
	OrderStatus,
	PayoutStatus,
	PlanAudience,
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

/**
 * El rol de un acceso del equipo: `owner` → "Dueño".
 *
 * El enum crudo obliga al operador a traducir en la cabeza, y un rol mal leído
 * es un alcance mal entendido: un `staff` no administra el equipo y un `owner`
 * sí. En el panel de la plataforma el rol decide qué puede hacer el negocio, y
 * una palabra mal traducida se convierte en un permiso mal entendido.
 *
 * `?? role` y no "Rol desconocido": un token fuera del enum es un dato que el
 * panel todavía no sabe nombrar, y mostrarlo crudo es más honesto que taparlo
 * con una etiqueta inventada.
 */
const BUSINESS_MEMBER_ROLE_LABELS: Record<BusinessMemberRole, string> = {
	owner: "Dueño",
	manager: "Gerente",
	staff: "Empleado",
};

export const businessMemberRoleLabel = (role: string): string =>
	BUSINESS_MEMBER_ROLE_LABELS[role as BusinessMemberRole] ?? role;

/**
 * El estado de un acceso: `active` → "Activo", `disabled` → "Pausado".
 *
 * "Deshabilitado" no es lo que pasó: el acceso sigue existiendo y el dueño
 * puede reactivarlo. Pausado dice lo que es —una puerta cerrada que se puede
 * volver a abrir— y no "deshabilitado", que suena a borrado.
 */
const BUSINESS_MEMBER_STATUS_LABELS: Record<BusinessMemberStatus, string> = {
	active: "Activo",
	disabled: "Pausado",
};

export const businessMemberStatusLabel = (status: string): string =>
	BUSINESS_MEMBER_STATUS_LABELS[status as BusinessMemberStatus] ?? status;

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
 * A quién le toca el aviso. El token crudo no sirve en la columna: `specific` y
 * `businesses` son dos cosas que el operador tiene que distinguir de un vistazo,
 * y son las dos que una etiqueta igual esconde. La diferencia que tiene que ver el
 * operador es de a quién le toca, no de cuántas personas son.
 *
 * Lo que esta columna no puede decir es la cantidad, y no es una falta del mapa:
 * las dos listas de un `specific` están fuera del read path a propósito, así
 * que el panel no tiene de dónde contarlas, y un "3 destinatarios" sería
 * inventar el dato. Ver el bloque de `announcements.columns.tsx` que explica por
 * qué esta columna no lleva número.
 *
 * Y ninguna de las dos se publica en el vacío, que es lo que este bloque daba
 * por sentado y es falso: un aviso `businesses` llega por ROL —la policy lo
 * concede con `my_role() = 'business'`, sin mirar `user_ids`— y un `specific`
 * que nombra negocios llega porque al publicar la API resuelve cada
 * `business_id` a su `owner_id` y lo suma a `user_ids`
 * (`announcements.service.ts`, `resolverDuenosDeNegocios`). El bloque de
 * `announcement-form.tsx` sobre lo que se retiró cuenta la historia completa.
 *
 * `?? audienceKind` por el mismo motivo que el resto del archivo.
 */
const ANNOUNCEMENT_AUDIENCE_LABELS: Record<AudienceKind, string> = {
	all: "Todo el mundo",
	consumers: "Consumidoras",
	businesses: "Negocios",
	specific: "Personas específicas",
};

export const announcementAudienceLabel = (audienceKind: string): string =>
	ANNOUNCEMENT_AUDIENCE_LABELS[audienceKind as AudienceKind] ?? audienceKind;

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

/**
 * El nombre del plan, en el vocabulario del operador.
 *
 * `free` → «Gratis»: es lo que el negocio tiene de verdad —sin pagar nada— y
 * no un «plan básico» que suena a producto de pago. `pro_plus` → «Pro Plus»:
 * el sufijo se escribe con mayúscula porque es parte del nombre del plan, no
 * una categoría.
 *
 * `?? code` y no "Plan desconocido": el código crudo ES la información cuando
 * el catálogo trae un plan que esta versión del panel todavía no nombra.
 */
const BUSINESS_PLAN_LABELS: Record<BusinessPlanCode, string> = {
	free: "Gratis",
	pro: "Pro",
	pro_plus: "Pro Plus",
};

export const businessPlanLabel = (code: string): string =>
	BUSINESS_PLAN_LABELS[code as BusinessPlanCode] ?? code;

/**
 * A quién sirve el plan: `business` → «Negocio», `consumer` → «Consumidor».
 *
 * El panel de hoy sólo ofrece planes de negocio, pero el catálogo admite las dos
 * audiencias y el plan DICE a qué clase de sujeto sirve: un «Pro» de negocio y
 * un «Pro» de consumidor no son el mismo plan, y el operador tiene que poder
 * distinguirlo sin leer el código.
 */
const PLAN_AUDIENCE_LABELS: Record<PlanAudience, string> = {
	business: "Negocio",
	consumer: "Consumidor",
};

export const businessPlanAudienceLabel = (audience: string): string =>
	PLAN_AUDIENCE_LABELS[audience as PlanAudience] ?? audience;

/**
 * Lo que un plan incluye, traducido.
 *
 * Las features son la puerta que el motor abre (`staff_access` habilita el
 * equipo, `payments` los pagos): mostrarlas crudas obliga al operador a
 * traducirlas en la cabeza, y una feature mal leída es una feature que el
 * operador cree que el negocio tiene y no tiene.
 *
 * `?? feature` por el mismo motivo que el resto del archivo: un token fuera del
 * enum se muestra crudo en vez de inventarle un nombre.
 */
const BUSINESS_FEATURE_LABELS: Record<BusinessFeature, string> = {
	staff_access: "Accesos de personal",
	payments: "Pagos",
	visibility_plus: "Visibilidad plus",
};

export const businessFeatureLabel = (feature: string): string =>
	BUSINESS_FEATURE_LABELS[feature as BusinessFeature] ?? feature;

/**
 * El tope de un plan, en palabras: «5» o «sin tope».
 *
 * `null` NO es cero: `pro_plus` no tiene tope, y un «0» leería como un plan que
 * no admite ni una sucursal —que no es lo que dice el catálogo, que prohíbe el
 * cero como tope—. El «sin tope» se dice con palabras porque es un permiso, y
 * un permiso no se escribe como un número.
 */
export const businessPlanLimitLabel = (limit: number | null): string =>
	limit === null ? "sin tope" : String(limit);
