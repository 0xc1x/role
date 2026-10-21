import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import {
  businessFinance,
  businessMembers,
  businessModeration,
  emailSends,
  emailTemplates,
  profiles,
} from '../../database/schema';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { seedBusiness, seedLocation, seedProfile } from '../../../test/seed';
import { BusinessesRepository } from './businesses.repository';

let ctx: TestDbContext;
let repo: BusinessesRepository;
let ownerId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new BusinessesRepository(ctx.db);
  ownerId = randomUUID();
  await ctx.db.insert(profiles).values({ id: ownerId, email: 'owner@biz.cl' });
});

afterAll(async () => {
  await ctx.stop();
});

describe('BusinessesRepository (DB real)', () => {
  test('insert crea preferencias + findById/findBySlug', async () => {
    const row = await repo.insert(ctx.db, {
      owner_id: ownerId,
      name: 'Panadería',
      slug: 'panaderia',
    });
    expect(await repo.findById(row.id)).toMatchObject({ name: 'Panadería' });
    expect(await repo.findBySlug('panaderia')).toMatchObject({ id: row.id });
    expect(await repo.findBySlug('nope')).toBeNull();
  });

  test('roleOf y ownedBusinessIds', async () => {
    const row = await repo.insert(ctx.db, {
      owner_id: ownerId,
      name: 'Café',
      slug: 'cafe',
    });
    expect(await repo.roleOf(row.id, ownerId)).toBe('owner');
    expect(await repo.roleOf(row.id, randomUUID())).toBeNull();
    expect(await repo.ownedBusinessIds(ownerId)).toContain(row.id);
  });

  /**
   * The owner lands in the MEMBERSHIP, and that is the only place he lands.
   *
   * `business_ownership` was the table Plan 3 drops, and the API was its last
   * writer: the trigger `trg_bootstrap_business_companions` only wrote it when
   * `auth.uid()` is set, and the API connects as the pooler role, where it is
   * not. So the row existed only because this method wrote it, and once the
   * readers moved to the membership model there was nothing left for it to be.
   *
   * The membership is what survives: it is the row that decides who the owner
   * is, and the one the transfer, the release and the recovery all move.
   */
  test('insert deja al dueño en la membresía', async () => {
    const row = await repo.insert(ctx.db, {
      owner_id: ownerId,
      name: 'Panadería La Espiga',
      slug: 'panaderia-la-espiga',
    });

    const [membership] = await ctx.db
      .select()
      .from(businessMembers)
      .where(eq(businessMembers.business_id, row.id));
    expect(membership?.user_id).toBe(ownerId);
    expect(membership?.role).toBe('owner');
    expect(membership?.status).toBe('active');
    expect(membership?.deleted_at).toBeNull();
    // El dueño no vence: un TTL de 24 horas con sello nuevo le quitaría su
    // propio negocio a las 24 horas de entrar.
    expect(membership?.session_ttl_hours).toBe(0);
    // Y el alias espeja el correo del dueño, como el backfill.
    expect(membership?.alias).toBe('owner@biz.cl');
  });

  /**
   * A member row needs the owner's email, and there is no second answer.
   *
   * The old code had a fallback —`${owner_id}@owner.invalid`— for a profile
   * that did not exist. It never persisted: `business_ownership.owner_id` is a
   * FK to `profiles(id)`, so a business for an owner without a profile fails
   * on that insert and the transaction is undone. The alias was a lie that
   * could not survive, and `business_members.alias` is UNIQUE per business:
   * writing it would have burned the alias of a real owner.
   *
   * So the owner row is not written, and the reason is said out loud.
   */
  test('sin perfil del dueño no hay membresía, y el motivo es explícito', async () => {
    const ghostOwner = randomUUID();

    await expect(
      repo.insert(ctx.db, {
        owner_id: ghostOwner,
        name: 'Negocio sin dueño',
        slug: 'negocio-sin-dueno',
      }),
    ).rejects.toThrow(/has no profile/);

    // Y NO quedó una fila de miembro con un alias inventado.
    const members = await ctx.db
      .select()
      .from(businessMembers)
      .where(eq(businessMembers.user_id, ghostOwner));
    expect(members).toHaveLength(0);
  });

  test('listForUser filtra por owner y estado', async () => {
    const mine = await repo.listForUser(ownerId, { page: 1, limit: 10 });
    expect(mine.total).toBeGreaterThanOrEqual(2);
    const other = await repo.listForUser(randomUUID(), { page: 1, limit: 10 });
    expect(other.total).toBe(0);
    const pending = await repo.listForUser(ownerId, {
      page: 1,
      limit: 10,
      verification_status: 'pending',
    });
    expect(
      pending.items.every((b) => b.verification_status === 'pending'),
    ).toBe(true);
  });

  test('listAll busca y filtra', async () => {
    const res = await repo.listAll({ page: 1, limit: 10, search: 'panad' });
    expect(res.items.map((b) => b.name)).toContain('Panadería');
  });

  test('update', async () => {
    const row = await repo.insert(ctx.db, {
      owner_id: ownerId,
      name: 'Tmp',
      slug: 'tmp',
    });
    expect(await repo.update(ctx.db, row.id, { name: 'Tmp2' })).toMatchObject({
      name: 'Tmp2',
    });
  });
});

describe('BusinessesRepository companions (DB real)', () => {
  test('insert deja los companions escritos y el agregado los lee', async () => {
    const row = await repo.insert(ctx.db, {
      owner_id: ownerId,
      name: 'Con companions',
      slug: 'con-companions',
      commission_rate: '0.1500',
      verification_status: 'rejected',
      rejection_reason: 'Docs ilegibles',
    });

    // El agregado devuelve las columnas bajo sus nombres históricos.
    expect(row).toMatchObject({
      owner_id: ownerId,
      commission_rate: '0.1500',
      balance: '0.00',
      verification_status: 'rejected',
      rejection_reason: 'Docs ilegibles',
      verified_at: null,
      verified_by: null,
    });

    const [finance] = await ctx.db
      .select()
      .from(businessFinance)
      .where(eq(businessFinance.business_id, row.id));
    const [moderation] = await ctx.db
      .select()
      .from(businessModeration)
      .where(eq(businessModeration.business_id, row.id));
    expect(finance?.commission_rate).toBe('0.1500');
    expect(moderation?.verification_status).toBe('rejected');
  });

  /**
   * The DTO's `owner_id` is a FACT of the row, and it comes from the
   * membership model.
   *
   * El agregado toma el dueño VIVO de la membresía, y la membresía archivada
   * cuando no hay ninguna viva —que es el caso del negocio liberado, medido en
   * la prueba de abajo. La fila de propiedad, la que Plan 3 retiró, no participa
   * de nada de esto.
   */
  test('el dueño del negocio sale de la membresía', async () => {
    const owner = await seedProfile(ctx.db);
    const biz = await seedBusiness(ctx.db, owner);

    const row = await repo.findById(biz.id);
    expect(row?.owner_id).toBe(owner);
  });

  /**
   * The owner of a RETIRED business is still named, and that is the point.
   *
   * The release archives the owner's membership instead of deleting it, precisely
   * so that the fact «this business had an owner» survives —and `owner_id` is a
   * `string` in the DTO, not a nullable one. So the aggregate takes the LIVE
   * owner when there is one, and the most recent ARCHIVED one when there is
   * not.
   *
   * The business is seeded INACTIVE on purpose: the invariant «an active
   * business always has a live owner» is enforced by the database
   * (`trg_business_keeps_an_owner`), and archiving the owner of an active
   * business is refused with `R0002`.
   */
  test('un negocio liberado sigue trayendo a su dueño, aunque la membresía esté archivada', async () => {
    const owner = await seedProfile(ctx.db);
    const biz = await seedBusiness(ctx.db, owner, { is_active: false });

    await ctx.db
      .update(businessMembers)
      .set({ deleted_at: new Date() })
      .where(eq(businessMembers.business_id, biz.id));

    const row = await repo.findById(biz.id);
    expect(row?.owner_id).toBe(owner);
  });

  /**
   * A business with a LIVE owner AND an archived one names the LIVE one.
   *
   * The state is real: a release archives the owner's membership, and a later
   * recovery (`assign_business_ownership`) promotes somebody else —so the
   * business carries two rows with `role = 'owner'`, one archived and one
   * alive. The aggregate has to pick the alive one, and it has to pick it the
   * same way on every read.
   *
   * The business is seeded INACTIVE because the invariant «an active business
   * always has a live owner» is enforced by the database
   * (`trg_business_keeps_an_owner`), and archiving the owner of an active
   * business is refused with `R0002`.
   */
  test('con dueño vivo y dueño archivado, el dueño es el VIVO', async () => {
    const owner = await seedProfile(ctx.db);
    const nuevo = await seedProfile(ctx.db);
    const biz = await seedBusiness(ctx.db, owner, { is_active: false });

    // El dueño viejo se archiva —una liberación— y su fila queda como
    // HISTORIA: con la fecha de la baja, que es más reciente que la del dueño
    // nuevo.
    await ctx.db
      .update(businessMembers)
      .set({ deleted_at: new Date(), updated_at: new Date() })
      .where(eq(businessMembers.business_id, biz.id));
    // …y el nuevo es un dueño VIVO del mismo negocio, con una fila más vieja:
    // si el agregado se guiara por la fecha de la última modificación, elegiría
    // al ARCHIVADO, que es el error que este test mide.
    await ctx.db.insert(businessMembers).values({
      business_id: biz.id,
      user_id: nuevo,
      role: 'owner',
      label: 'Dueño nuevo',
      alias: `nuevo-dueno-${nuevo.slice(0, 8)}@negocio.role.ec`,
      status: 'active',
      session_ttl_hours: 0,
      created_at: new Date('2020-01-01T00:00:00.000Z'),
      updated_at: new Date('2020-01-01T00:00:00.000Z'),
    });

    const row = await repo.findById(biz.id);
    expect(row?.owner_id).toBe(nuevo);
  });

  /**
   * A business with NO owner at all is not in the aggregate.
   *
   * The old join was an `INNER JOIN` against the ownership row, so a business
   * without one was not returned: `findById` said «no existe» and the listing
   * did not show it. The membership model keeps that shape —a business without
   * an owner is not a business anybody can administer— and the DTO's
   * `owner_id` cannot be null.
   */
  test('un negocio sin ningún dueño no está en el agregado', async () => {
    const owner = await seedProfile(ctx.db);
    const biz = await seedBusiness(ctx.db, owner, { owner_membership: false });

    expect(await repo.findById(biz.id)).toBeNull();
  });

  test('update reparte el patch entre businesses y sus companions', async () => {
    const row = await repo.insert(ctx.db, {
      owner_id: ownerId,
      name: 'Patch',
      slug: 'patch-companions',
    });
    const verifiedAt = new Date('2026-02-02T00:00:00.000Z');

    const updated = await repo.update(ctx.db, row.id, {
      name: 'Patch 2',
      commission_rate: '0.2000',
      verification_status: 'approved',
      verified_at: verifiedAt,
      verified_by: ownerId,
      rejection_reason: null,
    });
    expect(updated).toMatchObject({
      name: 'Patch 2',
      commission_rate: '0.2000',
      verification_status: 'approved',
      verified_at: verifiedAt,
      verified_by: ownerId,
      rejection_reason: null,
    });

    const [finance] = await ctx.db
      .select()
      .from(businessFinance)
      .where(eq(businessFinance.business_id, row.id));
    const [moderation] = await ctx.db
      .select()
      .from(businessModeration)
      .where(eq(businessModeration.business_id, row.id));
    expect(finance?.commission_rate).toBe('0.2000');
    expect(moderation?.verification_status).toBe('approved');
    expect(moderation?.rejection_reason).toBeNull();
  });

  test('update sin cambios de companion no toca business_moderation', async () => {
    const row = await seedBusiness(ctx.db, ownerId);
    const before = await ctx.db
      .select()
      .from(businessModeration)
      .where(eq(businessModeration.business_id, row.id));
    await repo.update(ctx.db, row.id, { description: 'Solo texto' });
    const after = await ctx.db
      .select()
      .from(businessModeration)
      .where(eq(businessModeration.business_id, row.id));
    expect(after[0]?.updated_at).toEqual(before[0]?.updated_at);
  });

  test('update de un negocio inexistente devuelve null', async () => {
    expect(
      await repo.update(ctx.db, '00000000-0000-0000-0000-000000000000', {
        name: 'No existe',
      }),
    ).toBeNull();
  });
});

describe('BusinessesRepository extras (DB real)', () => {
  test('hasPendingPayout y locationBelongsToBusiness', async () => {
    const owner = await seedProfile(ctx.db);
    const biz = (await seedBusiness(ctx.db, owner)).id;
    expect(await repo.hasPendingPayout(biz)).toBe(false);
    await ctx.db.execute(
      `insert into payouts (business_id, period_start, period_end, gross_amount, platform_fee, net_amount, status) values ('${biz}', '2025-01-01', '2025-01-15', 100, 10, 90, 'processing')`,
    );
    expect(await repo.hasPendingPayout(biz)).toBe(true);
    const loc = await seedLocation(ctx.db, biz);
    expect(await repo.locationBelongsToBusiness(loc.id, biz)).toBe(true);
    expect(await repo.locationBelongsToBusiness(loc.id, ownerId)).toBe(false);
  });

  test('listEmailSends devuelve solo los transaccionales del negocio', async () => {
    const owner = await seedProfile(ctx.db);
    const biz = (await seedBusiness(ctx.db, owner)).id;
    const other = (await seedBusiness(ctx.db, owner)).id;
    const [template] = await ctx.db
      .insert(emailTemplates)
      .values({
        name: 'business-approved',
        subject: 'Aprobado',
        body_html: '<p>Ok</p>',
      })
      .returning();
    if (!template) throw new Error('sin plantilla');

    // Mismo origen y tipo que el trigger, más un envío de campaña que debe quedar fuera.
    const insert = (sourceId: string, values: Record<string, unknown>) =>
      ctx.db.insert(emailSends).values({
        type: 'transactional',
        source_type: 'business',
        source_id: sourceId,
        template_id: template.id,
        email: 'owner@role.ec',
        ...values,
      });

    await insert(biz, {
      status: 'pending',
      created_at: new Date('2026-02-01'),
    });
    await insert(biz, {
      status: 'failed',
      error_message: 'You can only send testing emails to your own email',
      created_at: new Date('2026-02-02'),
    });
    await insert(other, { status: 'sent', created_at: new Date('2026-02-03') });
    await ctx.db.insert(emailSends).values({
      type: 'campaign',
      source_type: 'campaign',
      source_id: biz,
      template_id: template.id,
      email: 'lead@role.ec',
      status: 'sent',
    });

    const rows = await repo.listEmailSends(biz);

    // Más reciente primero, con el nombre de la plantilla resuelto.
    expect(rows.map((r) => r.status)).toEqual(['failed', 'pending']);
    expect(rows[0]).toMatchObject({
      email: 'owner@role.ec',
      template_name: 'business-approved',
      error_message: 'You can only send testing emails to your own email',
    });
    expect(rows[1]?.error_message).toBeNull();
    expect(await repo.listEmailSends(randomUUID())).toEqual([]);
  });
});
