/**
 * Ciclo de vida del triaje de un reporte de error. NO es un enum de Postgres:
 * la columna `app_store.state` es `text` a propósito (D4), porque un enum obliga
 * a migrar cada vez que aparece un namespace nuevo — que es exactamente el
 * acoplamiento que un store genérico tiene que evitar.
 *
 * El margen que deja `text` lo cierra ESTE vocabulario, que es el SSOT del
 * monorepo: la API valida contra él antes de escribir y el panel escribe contra
 * él. Si mañana hace falta un estado nuevo, se agrega acá y no en una
 * migración.
 *
 * OJO CON LA SEMÁNTICA, porque `state` junto a `delivery_status` se lee como si
 * fueran el mismo eje y no lo son. `delivery_status` contesta "¿llegó el aviso
 * al equipo?"; este contesta "¿qué hizo el equipo con el reporte?". Un reporte
 * entregado sigue `ABIERTO` hasta que un humano lo toque, y un reporte
 * `CORREGIDO` no dice nada sobre la entrega. Son ortogonales, y por eso el
 * eje de entrega no se metió aquí.
 *
 * LO QUE ESTE SCHEMA NO PUEDE GARANTIZAR: que la columna cumpla el
 * vocabulario. `state` es `text` sin CHECK en Postgres, así que nada en la
 * base impide que mañana haya un `'REABIERTO'` escrito a mano o por un script.
 * El que estrecha es el mapper de la API, que compara `row.state` contra esta
 * lista y cae a `null` sin lanzar. Ver `BugReportListItemSchema`.
 */
export const BUG_TRIAGE_STATES = [
	"ABIERTO",
	"EN_REPRODUCCION",
	"CORREGIDO",
	"DUPLICADO",
	"DESCARTADO",
] as const;
export type BugTriageState = (typeof BUG_TRIAGE_STATES)[number];

/**
 * Espejo del enum de Postgres `entry_origin`: el canal por el que llegó el
 * reporte. Vive en commons para que el panel pueda filtrar por origen sin
 * conocer el schema de la API.
 *
 * `web` se admite aunque hoy ningún escritor pueda asignarlo: la policy de
 * insert acepta `('ios','android','pwa')`, así que `web` es hoy el único valor
 * del enum que ni la policy ni un writer pueden producir — y el formulario
 * público de contacto tampoco lo pone, porque su insert no nombra `origin` y la
 * fila queda en `NULL`. Se admite para que la landing quepa después sin otra
 * migración, que es el motivo real y suficiente.
 *
 * Lo que NO puede aparecer es un canal que no sea de la app — un cliente no
 * elige su origen, y por eso lo fija la policy.
 */
export const ENTRY_ORIGINS = ["ios", "android", "pwa", "web"] as const;
export type EntryOrigin = (typeof ENTRY_ORIGINS)[number];
