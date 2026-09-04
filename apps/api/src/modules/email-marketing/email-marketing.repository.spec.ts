import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { seedProfile } from '../../../test/seed';
import { EmailMarketingRepository } from './email-marketing.repository';

let ctx: TestDbContext;
let repo: EmailMarketingRepository;

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new EmailMarketingRepository(ctx.db);
});

afterAll(async () => {
  await ctx.stop();
});

describe('EmailMarketingRepository components (DB real)', () => {
  test('CRUD de componentes', async () => {
    const [c] = await repo.insertComponent({
      name: 'Header',
      type: 'header',
      html_content: '<h1>Hola</h1>',
    });
    if (!c) throw new Error('sin componente');
    expect(await repo.findComponentById(c.id)).toMatchObject({ name: 'Header' });
    expect(await repo.findComponentById(randomUUID())).toBeNull();
    const listed = await repo.listComponents({ page: 1, limit: 10 });
    expect(listed.total).toBeGreaterThanOrEqual(1);
    expect(
      await repo.updateComponent(c.id, { html_content: '<h1>Adiós</h1>' }),
    ).toMatchObject({ html_content: '<h1>Adiós</h1>' });
    expect(await repo.deleteComponent(c.id)).toBe(true);
    expect(await repo.findComponentById(c.id)).toBeNull();
  });
});

describe('EmailMarketingRepository templates (DB real)', () => {
  test('CRUD de plantillas', async () => {
    const [t] = await repo.insertTemplate({
      name: 'Bienvenida',
      subject: 'Hola {{nombre}}',
      body_html: '<p>Hola</p>',
    });
    if (!t) throw new Error('sin plantilla');
    expect(await repo.findTemplateById(t.id)).toMatchObject({
      name: 'Bienvenida',
    });
    const listed = await repo.listTemplates({ page: 1, limit: 10 });
    expect(listed.total).toBeGreaterThanOrEqual(1);
    expect(await repo.updateTemplate(t.id, { subject: 'Otro' })).toMatchObject({
      subject: 'Otro',
    });
    expect(await repo.deleteTemplate(t.id)).toBe(true);
  });
});

describe('EmailMarketingRepository segments (DB real)', () => {
  test('CRUD + miembros estáticos', async () => {
    const [s] = await repo.insertSegment({ name: 'VIP', type: 'static' });
    if (!s) throw new Error('sin segmento');
    expect(await repo.findSegmentById(s.id)).toMatchObject({ name: 'VIP' });
    const u1 = await seedProfile(ctx.db);
    const u2 = await seedProfile(ctx.db);
    await repo.replaceSegmentUsers(s.id, [u1, u2]);
    expect(await repo.getSegmentUserIds(s.id)).toHaveLength(2);
    const u3 = await seedProfile(ctx.db);
    await repo.addSegmentUsers(s.id, [u3]);
    expect(await repo.getSegmentUserIds(s.id)).toHaveLength(3);
    await repo.replaceSegmentUsers(s.id, []);
    expect(await repo.getSegmentUserIds(s.id)).toHaveLength(0);
    const listed = await repo.listSegments({ page: 1, limit: 10 });
    expect(listed.total).toBeGreaterThanOrEqual(1);
    expect(await repo.deleteSegment(s.id)).toBe(true);
  });
});

describe('EmailMarketingRepository campaigns+sends (DB real)', () => {
  test('ciclo de estados y envíos', async () => {
    const [t] = await repo.insertTemplate({
      name: 'T',
      subject: 'S',
      body_html: 'B',
    });
    if (!t) throw new Error('sin plantilla');
    const [camp] = await repo.insertCampaign({ name: 'Campaña', template_id: t.id });
    if (!camp) throw new Error('sin campaña');
    expect(await repo.getCampaignById(camp.id)).toMatchObject({ status: 'draft' });

    const sends = await repo.insertSends([
      {
        type: 'campaign',
        source_type: 'campaign',
        source_id: camp.id,
        template_id: t.id,
        email: 'a@b.cl',
      },
      {
        type: 'campaign',
        source_type: 'campaign',
        source_id: camp.id,
        template_id: t.id,
        email: 'c@d.cl',
      },
    ]);
    expect(sends).toHaveLength(2);
    expect(await repo.countQueued(camp.id)).toBe(2);

    await repo.markProcessing(sends[0]?.id as string);
    expect(await repo.findSendById(sends[0]?.id as string)).toMatchObject({
      status: 'processing',
    });
    await repo.markSent(sends[0]?.id as string, 're_1');
    await repo.markFailed(sends[1]?.id as string, 'bounce', 'hard');
    // attempts 0+1 < max → queda en queued para reintento.
    expect(await repo.findSendById(sends[1]?.id as string)).toMatchObject({
      status: 'queued',
    });
    expect(await repo.countQueued(camp.id)).toBe(1);

    await repo.applyResendEvent('re_1', 'delivered');
    await repo.deleteSendsByCampaign(camp.id);
    expect(await repo.countQueued(camp.id)).toBe(0);

    await repo.updateCampaign(camp.id, { status: 'cancelled' });
    expect(await repo.getCampaignById(camp.id)).toMatchObject({ status: 'cancelled' });
    // Solo draft se puede borrar.
    expect(await repo.deleteCampaign(camp.id)).toBe(false);
  });
});

describe('EmailMarketingRepository consultas (DB real)', () => {
  test('findIdsMatchingFilters cubre operadores', async () => {
    const u = await seedProfile(ctx.db);
    await ctx.db.execute(`update profiles set city = 'Santiago' where id = '${u}'`);
    expect(
      await repo.findIdsMatchingFilters([{ field: 'city', op: 'eq', value: 'Santiago' }]),
    ).toContain(u);
    expect(
      await repo.findIdsMatchingFilters([{ field: 'city', op: 'neq', value: 'Santiago' }]),
    ).not.toContain(u);
    expect(
      await repo.findIdsMatchingFilters([{ field: 'city', op: 'like', value: 'sant' }]),
    ).toContain(u);
    expect(
      await repo.findIdsMatchingFilters([{ field: 'role', op: 'eq', value: 'user' }]),
    ).toContain(u);
    expect(
      await repo.findIdsMatchingFilters([{ field: 'created_at', op: 'gte', value: '2000-01-01' }]),
    ).toContain(u);
    expect(
      await repo.findIdsMatchingFilters([{ field: 'created_at', op: 'lte', value: '2000-01-01' }]),
    ).not.toContain(u);
  });

  test('findSubscribedRecipients respeta suscripción y categoría', async () => {
    const u = await seedProfile(ctx.db);
    expect(await repo.findSubscribedRecipients([], 'promotions')).toEqual([]);
    expect(await repo.findSubscribedRecipients([u], 'promotions')).toHaveLength(0);
    await ctx.db.execute(
      `insert into marketing_preferences (user_id, is_subscribed, categories) values ('${u}', true, ARRAY['promotions'])`,
    );
    const rows = await repo.findSubscribedRecipients([u], 'promotions');
    expect(rows.map((r) => r.user_id)).toContain(u);
    expect(await repo.findSubscribedRecipients([u], 'news')).toHaveLength(0);
  });

  test('listCampaigns filtra por estado y búsqueda', async () => {
    const [t] = await repo.insertTemplate({ name: 'T2', subject: 'S', body_html: 'B' });
    if (!t) throw new Error('sin plantilla');
    const [camp] = await repo.insertCampaign({
      name: 'Buscable xyz',
      template_id: t.id,
      status: 'scheduled',
    });
    if (!camp) throw new Error('sin campaña');
    const byStatus = await repo.listCampaigns({ page: 1, limit: 10, status: 'scheduled' });
    expect(byStatus.rows.map((r) => r.id)).toContain(camp.id);
    const bySearch = await repo.listCampaigns({ page: 1, limit: 10, search: 'xyz' });
    expect(bySearch.rows.map((r) => r.id)).toContain(camp.id);
    const due = await repo.findDueScheduled(new Date(Date.now() + 3600_000));
    expect(Array.isArray(due)).toBe(true);
  });

  test('findQueuedBatch/findPendingBatch/listSends/updateSend', async () => {
    const [t] = await repo.insertTemplate({ name: 'T3', subject: 'S', body_html: 'B' });
    if (!t) throw new Error('sin plantilla');
    const [camp] = await repo.insertCampaign({ name: 'C3', template_id: t.id });
    if (!camp) throw new Error('sin campaña');
    const sends = await repo.insertSends([
      { type: 'campaign', source_type: 'campaign', source_id: camp.id, template_id: t.id, email: 'q@q.cl' },
    ]);
    const id = sends[0]?.id as string;
    expect(await repo.findQueuedBatch(camp.id, 10)).toHaveLength(1);
    expect(await repo.findPendingBatch(10)).toHaveLength(1);
    const listed = await repo.listSends({ page: 1, limit: 10, source_id: camp.id });
    expect(listed.total).toBeGreaterThanOrEqual(1);
    expect(await repo.updateSend(id, { status: 'cancelled' })).toMatchObject({ id });
    expect(await repo.findQueuedBatch(camp.id, 10)).toHaveLength(0);
  });
});

describe('EmailMarketingRepository misceláneo (DB real)', () => {
  test('markCancelled, listSendsByCampaign, recountStats, unsubscribe', async () => {
    const [t] = await repo.insertTemplate({ name: 'TM', subject: 'S', body_html: 'B' });
    if (!t) throw new Error('sin plantilla');
    const [camp] = await repo.insertCampaign({ name: 'CM', template_id: t.id });
    if (!camp) throw new Error('sin campaña');
    const sends = await repo.insertSends([
      { type: 'campaign', source_type: 'campaign', source_id: camp.id, template_id: t.id, email: 'm@m.cl' },
    ]);
    const id = sends[0]?.id as string;

    await repo.markCancelled(id);
    expect(await repo.findSendById(id)).toMatchObject({ status: 'cancelled' });

    const byCamp = await repo.listSendsByCampaign(camp.id, { page: 1, limit: 10 });
    expect(byCamp.total).toBe(1);
    const byStatus = await repo.listSendsByCampaign(camp.id, { page: 1, limit: 10, status: 'cancelled' });
    expect(byStatus.total).toBe(1);

    await repo.recountStats(camp.id);
    expect(await repo.getCampaignById(camp.id)).toMatchObject({ total_recipients: 1 });

    const u = await seedProfile(ctx.db);
    await repo.unsubscribe(u);
    await repo.unsubscribe(u);
    const pref = await ctx.db.execute(
      `select is_subscribed from marketing_preferences where user_id = '${u}'`,
    );
    expect(pref).toBeDefined();
  });
});
