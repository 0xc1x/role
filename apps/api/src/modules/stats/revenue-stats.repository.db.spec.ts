import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { orders, payouts } from '../../database/schema';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedLocation,
  seedOffer,
  seedOrder,
  seedProfile,
} from '../../../test/seed';
import { RevenueStatsRepository } from './revenue-stats.repository';

let ctx: TestDbContext;
let repo: RevenueStatsRepository;
let businessId: string;
let offerId: string;

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` en UTC, el formato que espera el repository. */
function dayString(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Inserta una orden con el dinero explícito (seedOrder no lo expone). */
async function orderWithMoney(opts: {
  status: string;
  price: string;
  commissionRate: string;
  platformFee: string;
  netAmount: string;
  createdAt: Date;
}) {
  const [row] = await ctx.db
    .insert(orders)
    .values({
      user_id: await seedProfile(ctx.db),
      offer_id: offerId,
      business_id: businessId,
      order_number: `R-${crypto.randomUUID().slice(0, 8)}`,
      status: opts.status as never,
      price: opts.price,
      original_price: opts.price,
      pickup_code: 'ABC123',
      commission_rate: opts.commissionRate,
      platform_fee: opts.platformFee,
      net_amount: opts.netAmount,
      created_at: opts.createdAt,
    })
    .returning();
  if (!row) throw new Error('no se pudo insertar la orden');
  return row;
}

async function payoutWith(opts: {
  status: string;
  gross: string;
  fee: string;
  net: string;
  paidAt: Date | null;
  createdAt: Date;
}) {
  const [row] = await ctx.db
    .insert(payouts)
    .values({
      business_id: businessId,
      period_start: opts.createdAt,
      period_end: opts.createdAt,
      gross_amount: opts.gross,
      platform_fee: opts.fee,
      net_amount: opts.net,
      status: opts.status as never,
      paid_at: opts.paidAt,
      created_at: opts.createdAt,
    })
    .returning();
  if (!row) throw new Error('no se pudo insertar el payout');
  return row;
}

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new RevenueStatsRepository(ctx.db);
  const owner = await seedProfile(ctx.db);
  const biz = await seedBusiness(ctx.db, owner);
  businessId = biz.id;
  const loc = await seedLocation(ctx.db, businessId);
  offerId = (await seedOffer(ctx.db, businessId, loc.id)).id;
}, 120000);

afterAll(async () => {
  await ctx?.stop();
});

describe('RevenueStatsRepository (DB real)', () => {
  test('devengado y cobrado vienen de fuentes distintas', async () => {
    const now = new Date();
    const old = new Date(Date.now() - 5 * DAY_MS);

    // Legacy: platform_fee = 0 con commission_rate > 0 → la comisión efectiva
    // se deriva (round(100 * 0.10) = 10.00), no vale 0.
    await orderWithMoney({
      status: 'completed',
      price: '100.00',
      commissionRate: '0.1000',
      platformFee: '0',
      netAmount: '0',
      createdAt: now,
    });
    // Moderna: la comisión ya viene escrita.
    await orderWithMoney({
      status: 'completed',
      price: '50.00',
      commissionRate: '0.2000',
      platformFee: '10.00',
      netAmount: '40.00',
      createdAt: now,
    });
    // No completadas: cuentan en el conteo, no en el dinero.
    await orderWithMoney({
      status: 'cancelled',
      price: '30.00',
      commissionRate: '0.1000',
      platformFee: '3.00',
      netAmount: '27.00',
      createdAt: now,
    });
    await orderWithMoney({
      status: 'expired',
      price: '20.00',
      commissionRate: '0.1000',
      platformFee: '2.00',
      netAmount: '18.00',
      createdAt: now,
    });
    // Fuera de la ventana de hoy.
    await orderWithMoney({
      status: 'completed',
      price: '1000.00',
      commissionRate: '0.1000',
      platformFee: '100.00',
      netAmount: '900.00',
      createdAt: old,
    });

    // Cobrado: un payout pagado HOY (la mitad de lo devengado: el resto sigue
    // en el negocio) y otro pagado hace 5 días (fuera de la ventana).
    await payoutWith({
      status: 'paid',
      gross: '50.00',
      fee: '10.00',
      net: '40.00',
      paidAt: now,
      createdAt: old,
    });
    await payoutWith({
      status: 'paid',
      gross: '1000.00',
      fee: '100.00',
      net: '900.00',
      paidAt: old,
      createdAt: old,
    });
    // Pendiente de pago: entra en outstanding, no en collected.
    await payoutWith({
      status: 'pending',
      gross: '100.00',
      fee: '10.00',
      net: '90.00',
      paidAt: null,
      createdAt: now,
    });
    await payoutWith({
      status: 'failed',
      gross: '10.00',
      fee: '1.00',
      net: '9.00',
      paidAt: null,
      createdAt: now,
    });

    const today = { from: dayString(0), to: dayString(0) };
    const accrued = await repo.accrued(today);
    const collected = await repo.collected(today);

    // Devengado: 100 + 50 de las completadas de hoy; la de hace 5 días queda
    // fuera. La legacy aporta sus 10.00 derivados.
    expect(Number(accrued.gross_amount)).toBe(150);
    expect(Number(accrued.platform_fees)).toBe(20);
    expect(Number(accrued.business_net)).toBe(130);
    expect(accrued.total_orders).toBe(4);
    expect(accrued.completed_orders).toBe(2);
    expect(accrued.cancelled_orders).toBe(1);
    expect(accrued.expired_orders).toBe(1);

    // Cobrado: solo el payout pagado HOY. El devengado de hoy (150) NO coincide
    // con lo cobrado (50): esa diferencia es el punto del reporte.
    expect(Number(collected.gross_amount)).toBe(50);
    expect(Number(collected.platform_fees)).toBe(10);
    expect(Number(collected.business_net)).toBe(40);
    expect(collected.paid_payouts).toBe(1);
    expect(Number(collected.outstanding_business_net)).toBe(90);
    expect(collected.outstanding_payouts).toBe(1);
    expect(collected.failed_payouts).toBe(1);

    expect(Number(accrued.platform_fees)).not.toBe(
      Number(collected.platform_fees),
    );
  });

  test('el período mueve las dos caras por separado', async () => {
    const lastWeek = { from: dayString(-5), to: dayString(-5) };
    const accrued = await repo.accrued(lastWeek);
    const collected = await repo.collected(lastWeek);

    expect(Number(accrued.gross_amount)).toBe(1000);
    expect(Number(collected.gross_amount)).toBe(1000);
    // En esa ventana no hay nada pendiente ni fallido.
    expect(collected.outstanding_payouts).toBe(0);
    expect(collected.failed_payouts).toBe(0);
  });

  test('una ventana sin datos devuelve ceros, no undefined', async () => {
    const empty = { from: '2000-01-01', to: '2000-01-02' };
    const accrued = await repo.accrued(empty);
    const collected = await repo.collected(empty);

    expect(accrued.total_orders).toBe(0);
    expect(Number(accrued.gross_amount)).toBe(0);
    expect(Number(accrued.platform_fees)).toBe(0);
    expect(collected.paid_payouts).toBe(0);
    expect(Number(collected.gross_amount)).toBe(0);
    expect(Number(collected.outstanding_business_net)).toBe(0);
  });

  test('el filtro de estado no se confunde con el de período', async () => {
    // Guarda contra una condición mal construida: cambiar el filtro de `paid`
    // por el de período incluiría los payouts pendientes.
    const today = { from: dayString(0), to: dayString(0) };
    const collected = await repo.collected(today);
    const [pending] = await ctx.db
      .select({ net: payouts.net_amount })
      .from(payouts)
      .where(eq(payouts.status, 'pending' as never));

    expect(Number(pending?.net)).toBe(90);
    expect(Number(collected.business_net)).not.toBe(90);
  });

  test('la ventana es UTC aunque la sesión corra de zona horaria', async () => {
    // Dos órdenes completadas el mismo día UTC, a las 02:00Z y 05:00Z. Con la
    // sesión en UTC-4 el día local arranca a las 04:00Z, así que una ventana
    // anclada a la sesión excluiría la de las 02:00Z. El contrato dice días
    // UTC: si el corte se corriera, el panel sumaría un día equivocado.
    const day = dayString(0);
    await orderWithMoney({
      status: 'completed',
      price: '7.00',
      commissionRate: '0.1000',
      platformFee: '0.70',
      netAmount: '6.30',
      createdAt: new Date(`${day}T02:00:00.000Z`),
    });
    await orderWithMoney({
      status: 'completed',
      price: '11.00',
      commissionRate: '0.1000',
      platformFee: '1.10',
      netAmount: '9.90',
      createdAt: new Date(`${day}T05:00:00.000Z`),
    });

    const client = postgres(ctx.connectionString, {
      prepare: false,
      max: 1,
      connection: { TimeZone: 'Etc/GMT+4' },
    });
    const shifted = new RevenueStatsRepository(
      drizzle({ client }) as unknown as typeof ctx.db,
    );

    // La sesión realmente está corrida: si no, el test pasaría por nada.
    const [{ TimeZone: zone }] =
      (await client`show timezone`) as unknown as Array<{
        TimeZone: string;
      }>;
    expect(zone).toBe('Etc/GMT+4');

    const today = { from: day, to: day };
    const accrued = await shifted.accrued(today);
    const collected = await shifted.collected(today);

    // 150 de las completadas created_at = now(), más las dos del borde.
    expect(Number(accrued.gross_amount)).toBe(168);
    expect(Number(accrued.platform_fees)).toBe(21.8);
    expect(Number(collected.gross_amount)).toBe(50);

    await client.end({ timeout: 5 });
  });
});
