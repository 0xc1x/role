import { sql } from 'drizzle-orm';
import { orders } from './schema/orders';

/**
 * Comisión efectiva de una orden: la que el negocio realmente debe.
 *
 * ÚNICA definición de la regla. La comparten la generación de payouts
 * (`PayoutsRepository.generate`) y el reporte de dinero
 * (`RevenueStatsRepository.accrued`): si cada uno derivara la comisión por su
 * cuenta, "devengado" y "cobrado" podrían medir cosas distintas y el panel
 * mostraría una contradicción sin que nadie supiera de dónde salió.
 *
 * Las órdenes anteriores a las columnas de comisión quedaron con
 * `platform_fee = 0` y `commission_rate > 0`; ahí la comisión se deriva como
 * `round(price * commission_rate, 2)`, que es la convención que ya usa la
 * generación de payouts.
 */
export function effectivePlatformFeeSql() {
  return sql`case when ${orders.platform_fee} = 0 and ${orders.commission_rate} > 0 then round(${orders.price} * ${orders.commission_rate}, 2) else ${orders.platform_fee} end`;
}

/** Neto del negocio: bruto menos la comisión efectiva. */
export function effectiveNetAmountSql() {
  return sql`${orders.price} - ${effectivePlatformFeeSql()}`;
}
