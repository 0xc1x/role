export const CONTACT_ROLES = ["negocio", "persona"] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

// La geografía de lanzamiento NO vive en el contrato: es `app_config`
// (`contact.cities`). Un fallback hardcodeado en commons convertía la lista en
// un segundo SSOT que nadie actualiza al abrir una ciudad nueva.

/**
 * Espejo del enum de Postgres `delivery_status`, que es donde caen los
 * mensajes del formulario público de contacto. Vive en commons para que el
 * panel pueda filtrar por estado sin conocer el schema de la API.
 *
 * OJO CON LA SEMÁNTICA, porque el nombre engaña: esto NO es una bandeja de
 * entrada. `contact.service` inserta la fila en `PENDIENTE` y la mueve a
 * `PROCESADO` en cuanto el correo de notificación se entrega (y la devuelve a
 * `PENDIENTE` si la entrega falla y queda encolada para reintento). O sea,
 * `PENDIENTE` significa "el aviso por correo todavía no se entregó", no
 * "nadie ha leído el mensaje". `PROCESADO` es la fila mayoritaria: casi todo
 * mensaje entregado ya está en `PROCESADO` antes de que un humano lo abra.
 *
 * Por eso el eje se llama `delivery_status` y no `status`: la columna registra
 * la ENTREGA del correo de aviso, no el triaje de la bandeja. Un `status`
 * invita a leerlo como "sin leer", que es justo lo que no es.
 */
export const CONTACT_DELIVERY_STATUSES = [
	"PENDIENTE",
	"PROCESADO",
	"ERROR",
] as const;
export type ContactDeliveryStatus = (typeof CONTACT_DELIVERY_STATUSES)[number];
