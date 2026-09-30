/**
 * Claims públicos del producto, en un solo lugar.
 *
 * El sitio y la app publicaban cifras mutuamente excluyentes sobre lo mismo:
 * "hasta 70%", "entre 50% y 70%", "un tercio del precio", "mitad de precio".
 * Dos de ellas además cambiaban de sentido según dónde aparecieran: "entre
 * 50% y 70% del precio original" habla de lo que se PAGA, y "entre 50% y 70%
 * menos" de lo que se AHORRA. Para un usuario, lo mismo son cosas distintas.
 *
 * Vivían en archivos separados por app, así que la deriva no era un accidente
 * sino una consecuencia: cambiar el número en el sitio no obligaba a cambiarlo
 * en la app, y el compilador no decía nada. Por eso vive aquí, en la SSOT de
 * contratos. Un cambio acá obliga a las dos superficies.
 *
 * ⚠️ EL TECHO ES PROVISIONAL Y ESTÁ FUNDADO EN DATOS SEMILLA, NO EN UNA
 * POLÍTICA DE PRECIOS. Las 8 ofertas de
 * `supabase/migrations/20260507200508_insert_seed_offers_coupons_orders.sql`
 * dan 50,00% en siete casos y 54,55% en una. Es andamiaje de prueba — su
 * moneda es `COP`, de Colombia, mientras el producto es ecuatoriano — y no
 * expresa la intención de negocio de nadie. Lo único que sí sabemos hoy es que
 * el 70% nunca tuvo respaldo.
 *
 * `offers.discount_percentage` es una columna GENERATED con solo
 * `CHECK (discounted_price <= original_price)`: ningún rango lo impone el
 * schema, el techo depende de lo que publiquen los comercios. El día que un
 * comercio publique 60%, este "hasta 55%" es falso otra vez. Cuando haya datos
 * de un piloto real, cambiá las dos constantes y el copy de las dos apps se
 * mueve con ellas.
 */

/** Piso del ahorro, en porcentaje sobre el precio original. */
export const DISCOUNT_MIN_PERCENT = 50;

/** Techo del ahorro, en porcentaje sobre el precio original. Provisional: ver la nota de arriba. */
export const DISCOUNT_MAX_PERCENT = 55;

/** Rango del ahorro, listo para insertar en una frase. */
export const DISCOUNT_RANGE = `${DISCOUNT_MIN_PERCENT}% y ${DISCOUNT_MAX_PERCENT}%`;

/**
 * Única forma del claim en prosa: "entre 50% y 55% menos".
 * Se usa "menos" y no "del precio original" a propósito: esa construcción
 * significa lo contrario.
 */
export const DISCOUNT_SAVINGS_CLAIM = `entre ${DISCOUNT_RANGE} menos`;

/** Forma corta para títulos y meta social: "hasta 55%". */
export const DISCOUNT_MAX_CLAIM = `hasta ${DISCOUNT_MAX_PERCENT}%`;
