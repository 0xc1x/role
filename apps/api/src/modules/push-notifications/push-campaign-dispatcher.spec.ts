import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { consumerNotificationPreferences, deviceTokens } from '../../database/schema';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { seedProfile } from '../../../test/seed';
import { CampaignsService } from '../email-marketing/campaigns.service';
import { EmailMarketingRepository } from '../email-marketing/email-marketing.repository';
import { RecipientsService } from '../email-marketing/recipients.service';
import { RendererService } from '../email-marketing/renderer.service';
import { NotificationsRepository } from '../notifications/notifications.repository';
import { NotificationsService } from '../notifications/notifications.service';
import {
  PushNotificationsRepository,
  type PushSendRow,
} from './push-notifications.repository';
import { PushCampaignDispatcher } from './push-campaign-dispatcher';

let ctx: TestDbContext;
let dispatcher: PushCampaignDispatcher;
let campaignsService: CampaignsService;
let emailRepo: EmailMarketingRepository;
let pushRepo: PushNotificationsRepository;
let queueCalls: Array<[string, unknown, { delay?: number }]> = [];
let templateId: string;
let campaignId: string;
let userA: string; // con token activo
let userB: string; // sin token activo
let userC: string; // con push_enabled = false

const okFetch = () =>
  (globalThis.fetch = (async () =>
    new Response(JSON.stringify({ data: { status: 'ok' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch);

beforeAll(async () => {
  ctx = await createTestDb();
  const config = {
    get: (key: string) =>
      key === 'CORS_ORIGINS' ? 'http://localhost:3000' : undefined,
  } as unknown as ConfigService<never, never>;

  emailRepo = new EmailMarketingRepository(ctx.db);
  pushRepo = new PushNotificationsRepository(ctx.db);
  const renderer = new RendererService(config);
  const recipients = new RecipientsService(emailRepo);
  const notifications = new NotificationsService(
    new NotificationsRepository(ctx.db),
    config,
  );
  campaignsService = new CampaignsService(
    emailRepo,
    renderer,
    recipients,
    config,
  );
  dispatcher = new PushCampaignDispatcher(
    campaignsService,
    emailRepo,
    recipients,
    pushRepo,
    notifications,
    {
      add: async (...args: [string, unknown, { delay?: number }]) => {
        queueCalls.push(args);
      },
    } as unknown as Queue<{ campaignId: string }>,
  );
  dispatcher.onModuleInit();

  globalThis.fetch = okFetch() as typeof fetch;

  userA = await seedProfile(ctx.db);
  userB = await seedProfile(ctx.db);
  userC = await seedProfile(ctx.db);
  await ctx.db.insert(deviceTokens).values([
    { user_id: userA, token: 'tok-a', platform: 'android', is_active: true },
  ]);
  await ctx.db
    .insert(consumerNotificationPreferences)
    .values({ user_id: userC, push_enabled: false });

  const [template] = await pushRepo.insertTemplate({
    name: 'Promo push',
    title: 'Hola {{nombre}}',
    body: 'Nueva oferta cerca de ti',
    data: { link: '/ofertas' },
  });
  templateId = template!.id;
});

afterAll(async () => {
  await ctx.stop();
});

async function seedCampaign(
  overrides: Partial<Parameters<EmailMarketingRepository['insertCampaign']>[0]> = {},
) {
  const [row] = await emailRepo.insertCampaign({
    name: 'Campaña push',
    channel: 'push',
    template_id: templateId,
    category: 'announcements',
    segment_ids: [],
    include_user_ids: [userA, userB, userC],
    exclude_user_ids: [],
    status: 'draft',
    scheduled_at: null,
    ...overrides,
  });
  campaignId = row!.id;
  return row!;
}

describe('PushCampaignDispatcher (DB real + fetch stub)', () => {
  test('se registra en CampaignsService y send() ramifica por canal', async () => {
    const campaign = await seedCampaign();
    // La campaña push pasa por el dispatcher, no por el pipeline de email.
    const dto = await campaignsService.send(campaign.id);
    expect(dto.status).toBe('sending');
    expect(dto.channel).toBe('push');

    const ledger = await pushRepo.findQueuedPushBatch(campaign.id, 50);
    expect(ledger).toHaveLength(2); // userC queda fuera por push_enabled = false
    expect(ledger.map((s: PushSendRow) => s.user_id).sort()).toEqual(
      [userA, userB].sort(),
    );
    // Con cola stub: el lote se encola en vez de ejecutarse inline.
    expect(queueCalls.length).toBeGreaterThan(0);
  });

  test('processBatch entrega, marca sent/failed y cierra la campaña', async () => {
    const campaign = await seedCampaign({ name: 'Campaña push 2' });
    await dispatcher.enqueueAndStart(campaign);

    const processed = await dispatcher.processBatch(
      (await emailRepo.getCampaignById(campaign.id))!,
    );
    expect(processed).toBe(2); // userA + userB en el lote

    // userA tenía token activo → sent; userB sin tokens → failed tras agotar
    // sus 3 intentos (reintento con backoff, igual que email_sends).
    for (let i = 0; i < 2; i++) {
      await dispatcher.processBatch(
        (await emailRepo.getCampaignById(campaign.id))!,
      );
    }
    const updated = (await emailRepo.getCampaignById(campaign.id))!;
    expect(updated.status).toBe('sent'); // 1 sent > 0
    expect(updated.total_sent).toBe(1);
    expect(updated.total_failed).toBe(1);
    expect(updated.total_recipients).toBe(2);
  });

  test('campaña programada a futuro encola con delay y queda sending', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const campaign = await seedCampaign({
      name: 'Campaña push programada',
      status: 'scheduled',
      scheduled_at: future,
    });
    const dto = await campaignsService.send(campaign.id);
    expect(dto.status).toBe('sending');
    const last = queueCalls.at(-1)!;
    expect(last[2]?.delay).toBeGreaterThan(0);
  });

  test('assertTemplate rechaza plantillas inexistentes', async () => {
    await expect(
      dispatcher.assertTemplate('00000000-0000-4000-8000-000000000000'),
    ).rejects.toThrow('Plantilla push no encontrada');
    await expect(dispatcher.assertTemplate(templateId)).resolves.toBeUndefined();
  });
});
