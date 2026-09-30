/**
 * MONEDA DE LA PLATAFORMA: la unidad de TODA cifra de dinero agregada.
 *
 * POR QUÉ EXISTE: los agregados de dinero no llevan unidad. `RevenueStats` (el
 * reporte devengado/cobrado) y `PayoutDto` exponen `gross_amount`,
 * `platform_fees` y `net_amount` como números pelados, sin campo de moneda. Un
 * número sin unidad en un panel de administración es un número que el operador
 * tiene que interpretar de memoria, y esa memoria es la que produce
 * conciliaciones equivocadas. El rótulo tiene que salir de un solo lugar.
 *
 * POR QUÉ ES DE LA PLATAFORMA Y NO DEL NEGOCIO: `businesses.currency` es un
 * campo POR negocio (con default USD), y un agregado de plataforma suma filas
 * de muchos negocios. Etiquetar un agregado con la moneda de un negocio —
 * sea la primera fila, sea la del filtro activo — es etiquetar con un dato que
 * no describe el conjunto. La moneda es una propiedad de la plataforma, así que
 * vive acá y no en ninguna fila.
 *
 * No es un enum a propósito: hay un solo valor y es una decisión, no una
 * omisión. Si alguna vez la plataforma operara en dos monedas, la respuesta
 * correcta NO es agregar códigos a esta lista, sino agregar `currency` a los
 * DTO de dinero para que cada cifra diga su propia unidad.
 *
 * Consumidores: cualquier rótulo de dinero del panel (admin, y el día que
 * exista, mobile/landing) formatea con este valor. Nunca con un literal suelto
 * ni con el `currency` de un negocio.
 */
export const PLATFORM_CURRENCY = "USD";

/** Tipo del literal, para que no se pueda asignar otro string por accidente. */
export type PlatformCurrency = typeof PLATFORM_CURRENCY;
