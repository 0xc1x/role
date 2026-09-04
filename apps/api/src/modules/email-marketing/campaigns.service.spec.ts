jest.mock('juice', () => ({
  __esModule: true,
  default: jest.fn((html: string) => html),
}));

const resendHarness: { Resend?: jest.Mock; __send?: jest.Mock } = {};
jest.mock('resend', () => {
  const send = jest.fn();
  const Resend = jest.fn(() => ({ emails: { send } }));
  resendHarness.Resend = Resend;
  resendHarness.__send = send;
  return { Resend, __send: send };
});

jest.mock('@0xc1x/role-commons', () => ({
  paginatedDataFromQuery: jest.fn(),
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { paginatedDataFromQuery } from '@0xc1x/role-commons';
import { CampaignsService } from './campaigns.service';
import { RecipientsService } from './recipients.service';
import { RendererService } from './renderer.service';
import {
  EmailMarketingRepository,
  type CampaignRow,
  type SendRow,
  type TemplateRow,
} from './email-marketing.repository';

const resendMock = resendHarness as { Resend: jest.Mock; __send: jest.Mock };
const resendSend = resendMock.__send;
const CAMPAIGN_ID = 'b3e6c8f0-1a2b-3c4d-5e6f-7a8b9c0d1e2f';
const TEMPLATE_ID = 'd4f5a6b7-1a2b-3c4d-5e6f-7a8b9c0d1e2f';

const flush = () => new Promise((resolve) => setImmediate(resolve));

/** Sustitución {{var}} idéntica en espíritu a RendererService (sin escape). */
const sub = (tpl: string, vars: Record<string, string>) =>
  tpl.replace(/\{\{\s*(\w+)\s*\}\}/gi, (_, key: string) => vars[key] ?? '');

const makeCampaign = (overrides: Partial<CampaignRow> = {}): CampaignRow =>
  ({
    id: CAMPAIGN_ID,
    name: 'Campaña test',
    description: null,
    template_id: TEMPLATE_ID,
    subject_override: null,
    body_override: null,
    category: 'announcements',
    segment_ids: ['seg-1'],
    include_user_ids: [],
    exclude_user_ids: [],
    created_by: null,
    scheduled_at: null,
    status: 'draft',
    sent_at: null,
    total_recipients: 0,
    total_sent: 0,
    total_delivered: 0,
    total_opened: 0,
    total_clicked: 0,
    total_bounced: 0,
    created_at: new Date('2025-01-01T00:00:00Z'),
    updated_at: new Date('2025-01-01T00:00:00Z'),
    deleted_at: null,
    ...overrides,
  }) as CampaignRow;

const makeTemplate = (overrides: Partial<TemplateRow> = {}): TemplateRow =>
  ({
    id: TEMPLATE_ID,
    name: 'Plantilla test',
    description: null,
    subject: 'Hola {{nombre}}',
    body_html: '<p>Hola {{nombre}}</p>',
    header_id: null,
    footer_id: null,
    variables: ['nombre'],
    is_active: true,
    created_at: new Date('2025-01-01T00:00:00Z'),
    updated_at: new Date('2025-01-01T00:00:00Z'),
    deleted_at: null,
    ...overrides,
  }) as TemplateRow;

const makeSend = (overrides: Partial<SendRow> = {}): SendRow =>
  ({
    id: 's-1',
    type: 'campaign',
    source_type: 'campaign',
    source_id: CAMPAIGN_ID,
    template_id: TEMPLATE_ID,
    user_id: 'u-1',
    email: 'ana@correo.com',
    variables_used: { nombre: 'Ana', unsubscribe_url: 'https://x/u/u-1' },
    resend_id: null,
    status: 'pending',
    attempts: 0,
    max_attempts: 5,
    error_message: null,
    error_code: null,
    scheduled_at: new Date('2025-01-01T00:00:00Z'),
    queued_at: new Date('2025-01-01T00:00:00Z'),
    processed_at: null,
    sent_at: null,
    delivered_at: null,
    opened_at: null,
    clicked_at: null,
    bounced_at: null,
    created_at: new Date('2025-01-01T00:00:00Z'),
    updated_at: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  }) as SendRow;

const RECIPIENTS = [
  { userId: 'u-1', email: 'ana@correo.com', fullName: 'Ana' },
  { userId: 'u-2', email: 'beto@correo.com', fullName: null },
];

describe('CampaignsService', () => {
  let service: CampaignsService;
  let repository: jest.Mocked<EmailMarketingRepository>;
  let renderer: { assemble: jest.Mock; renderVariables: jest.Mock; unsubscribeUrl: jest.Mock };
  let recipients: { resolve: jest.Mock };
  let config: { get: jest.Mock };
  let queue: { add: jest.Mock };
  let env: Record<string, string | undefined>;

  beforeEach(async () => {
    env = {
      RESEND_API_KEY: 'test-key',
      REDIS_URL: 'redis://localhost:6379',
      EMAIL_FROM: 'Rolé <hola@role.mx>',
    };
    queue = { add: jest.fn() };
    // resetAllMocks borra la impl del constructor mockeado; se re-arma cada test.
    resendMock.Resend.mockImplementation(() => ({ emails: { send: resendSend } }));

    const module = await Test.createTestingModule({
      providers: [
        CampaignsService,
        {
          provide: EmailMarketingRepository,
          useValue: {
            findTemplateById: jest.fn(),
            findComponentById: jest.fn(),
            getCampaignById: jest.fn(),
            updateCampaign: jest.fn(),
            deleteSendsByCampaign: jest.fn(),
            insertSends: jest.fn().mockResolvedValue([]),
            recountStats: jest.fn(),
            findDueScheduled: jest.fn().mockResolvedValue([]),
            listCampaigns: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
            findPendingBatch: jest.fn().mockResolvedValue([]),
            findQueuedBatch: jest.fn().mockResolvedValue([]),
            countQueued: jest.fn().mockResolvedValue(0),
            markProcessing: jest.fn(),
            markSent: jest.fn(),
            markFailed: jest.fn(),
            listSendsByCampaign: jest.fn(),
          },
        },
        {
          provide: RendererService,
          useValue: {
            assemble: jest.fn(
              (parts: {
                headerHtml?: string | null;
                bodyHtml: string;
                footerHtml?: string | null;
                vars?: Record<string, string>;
              }) =>
                sub(
                  `${parts.headerHtml ?? ''}${parts.bodyHtml}${parts.footerHtml ?? ''}`,
                  parts.vars ?? {},
                ),
            ),
            renderVariables: jest.fn(
              (tpl: string, vars: Record<string, string>) => sub(tpl, vars),
            ),
            unsubscribeUrl: jest.fn((id: string) => `https://x/unsubscribe?t=${id}`),
          },
        },
        { provide: RecipientsService, useValue: { resolve: jest.fn().mockResolvedValue(RECIPIENTS) } },
        { provide: ConfigService, useValue: { get: jest.fn((key: string) => env[key]) } },
        { provide: getQueueToken('email-expedition'), useValue: queue },
      ],
    }).compile();

    service = module.get(CampaignsService);
    repository = module.get(EmailMarketingRepository);
    renderer = module.get(RendererService);
    recipients = module.get(RecipientsService);
    config = module.get(ConfigService);
    // clearAllMocks (no reset): preserva las implementaciones de los providers.
    jest.clearAllMocks();
    resendMock.Resend.mockImplementation(() => ({ emails: { send: resendSend } }));
    (paginatedDataFromQuery as jest.Mock).mockImplementation(
      (data: unknown[], q: { page: number; limit: number }, total: number) => ({
        data,
        meta: { ...q, total },
      }),
    );
    repository.insertSends.mockResolvedValue([]);
    repository.findDueScheduled.mockResolvedValue([]);
    repository.listCampaigns.mockResolvedValue({ rows: [], total: 0 });
    repository.findPendingBatch.mockResolvedValue([]);
    repository.findQueuedBatch.mockResolvedValue([]);
    repository.countQueued.mockResolvedValue(0);
    repository.getCampaignById.mockResolvedValue(makeCampaign());
    repository.updateCampaign.mockResolvedValue(makeCampaign({ status: 'sending' }));
    repository.findTemplateById.mockResolvedValue(makeTemplate());
    config.get.mockImplementation((key: string) => env[key]);
  });

  describe('preview', () => {
    it('falla con 404 si la plantilla no existe', async () => {
      repository.findTemplateById.mockResolvedValue(null);
      await expect(service.preview({ templateId: 'nope' })).rejects.toThrow(NotFoundException);
    });

    it('renderiza asunto y cuerpo con variables de ejemplo', async () => {
      const out = await service.preview({ templateId: TEMPLATE_ID });

      expect(out.subject).toBe('Hola Ana Torres');
      expect(out.html).toContain('<p>Hola Ana Torres</p>');
      expect(out.variables_used).toEqual(['nombre']);
      expect(renderer.assemble).toHaveBeenCalledWith(
        expect.objectContaining({ bodyHtml: '<p>Hola {{nombre}}</p>', headerHtml: null, footerHtml: null }),
      );
    });

    it('aplica overrides de asunto y cuerpo sobre la plantilla', async () => {
      const out = await service.preview({
        templateId: TEMPLATE_ID,
        subjectOverride: 'Asunto custom',
        bodyOverride: '<p>Cuerpo custom</p>',
      });

      expect(out.subject).toBe('Asunto custom');
      expect(renderer.assemble).toHaveBeenCalledWith(
        expect.objectContaining({ bodyHtml: '<p>Cuerpo custom</p>' }),
      );
    });

    it('incluye header y footer cuando la plantilla los referencia', async () => {
      repository.findTemplateById.mockResolvedValue(
        makeTemplate({ header_id: 'h-1', footer_id: 'f-1' }),
      );
      repository.findComponentById.mockImplementation(async (id) =>
        id === 'h-1'
          ? ({ id, html_content: '<header>H</header>' } as never)
          : ({ id, html_content: '<footer>F</footer>' } as never),
      );

      const out = await service.preview({ templateId: TEMPLATE_ID });

      expect(out.html).toBe('<header>H</header><p>Hola Ana Torres</p><footer>F</footer>');
    });
  });

  describe('test', () => {
    const dto = { emails: ['a@x.com', 'b@x.com'] };

    it('falla si la campaña no tiene plantilla', async () => {
      repository.getCampaignById.mockResolvedValue(makeCampaign({ template_id: null }));
      await expect(service.test(CAMPAIGN_ID, dto as never)).rejects.toThrow(BadRequestException);
    });

    it('envía a cada email con asunto [TEST] y cuenta los exitosos', async () => {
      resendSend.mockResolvedValue({ data: { id: 're_1' }, error: null });

      const out = await service.test(CAMPAIGN_ID, dto as never);

      expect(out).toEqual({ sent: 2 });
      expect(resendSend).toHaveBeenCalledTimes(2);
      expect(resendSend).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'a@x.com', subject: '[TEST] Hola Ana Torres' }),
      );
    });

    it('no corta el envío cuando un destinatario falla', async () => {
      resendSend
        .mockRejectedValueOnce(new Error('bounce'))
        .mockResolvedValue({ data: { id: 're_1' }, error: null });

      const out = await service.test(CAMPAIGN_ID, dto as never);

      expect(out).toEqual({ sent: 1 });
    });

    it('usa el body override cuando viene en el dto', async () => {
      resendSend.mockResolvedValue({ data: { id: 're_1' }, error: null });

      await service.test(CAMPAIGN_ID, { emails: ['a@x.com'], overrides: { body_html: '<p>Custom</p>' } } as never);

      expect(renderer.assemble).toHaveBeenCalledWith(
        expect.objectContaining({ bodyHtml: '<p>Custom</p>' }),
      );
    });
  });

  describe('testTemplate', () => {
    it('prefija [TEST] y devuelve el conteo de exitosos', async () => {
      resendSend
        .mockRejectedValueOnce(new Error('bounce'))
        .mockResolvedValue({ data: { id: 're_1' }, error: null });

      const out = await service.testTemplate(TEMPLATE_ID, ['a@x.com', 'b@x.com']);

      expect(out).toEqual({ sent: 1 });
      expect(resendSend).toHaveBeenCalledWith(
        expect.objectContaining({ subject: '[TEST] Hola Ana Torres' }),
      );
    });
  });

  describe('send', () => {
    it('falla con 404 si la campaña no existe', async () => {
      repository.getCampaignById.mockResolvedValue(null);
      await expect(service.send(CAMPAIGN_ID)).rejects.toThrow(NotFoundException);
    });

    it.each(['sent', 'sending', 'cancelled'] as const)(
      'rechaza enviar una campaña en estado %s',
      async (status) => {
        repository.getCampaignById.mockResolvedValue(makeCampaign({ status }));
        await expect(service.send(CAMPAIGN_ID)).rejects.toThrow(BadRequestException);
      },
    );

    it('rechaza campañas sin plantilla', async () => {
      repository.getCampaignById.mockResolvedValue(makeCampaign({ template_id: null }));
      await expect(service.send(CAMPAIGN_ID)).rejects.toThrow(BadRequestException);
    });

    it('rechaza campañas sin segmentos ni usuarios incluidos', async () => {
      repository.getCampaignById.mockResolvedValue(
        makeCampaign({ segment_ids: [], include_user_ids: [] }),
      );
      await expect(service.send(CAMPAIGN_ID)).rejects.toThrow(BadRequestException);
    });

    it('rechaza cuando ningún destinatario cumple los criterios', async () => {
      recipients.resolve.mockResolvedValue([]);
      await expect(service.send(CAMPAIGN_ID)).rejects.toThrow(BadRequestException);
    });

    it('al reintentar una failed limpia los envíos del intento anterior', async () => {
      repository.getCampaignById.mockResolvedValue(makeCampaign({ status: 'failed' }));

      await service.send(CAMPAIGN_ID);

      expect(repository.deleteSendsByCampaign).toHaveBeenCalledWith(CAMPAIGN_ID);
    });

    it('encola un email_sends por destinatario y arranca la campaña vía BullMQ', async () => {
      const out = await service.send(CAMPAIGN_ID);

      const rows = repository.insertSends.mock.calls[0]![0];
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        type: 'campaign',
        source_id: CAMPAIGN_ID,
        template_id: TEMPLATE_ID,
        user_id: 'u-1',
        email: 'ana@correo.com',
        status: 'pending',
        max_attempts: 5,
        variables_used: { nombre: 'Ana', unsubscribe_url: 'https://x/unsubscribe?t=u-1' },
      });
      expect(rows[1]).toMatchObject({ email: 'beto@correo.com', variables_used: { nombre: '' } });
      expect(repository.recountStats).toHaveBeenCalledWith(CAMPAIGN_ID);
      expect(repository.updateCampaign).toHaveBeenCalledWith(CAMPAIGN_ID, { status: 'sending' });
      expect(queue.add).toHaveBeenCalledWith('process-batch', { campaignId: CAMPAIGN_ID }, undefined);
      expect(out.status).toBe('sending');
      expect(out.total_recipients).toBe(0);
    });

    it('re-encola con delay cuando la campaña está programada a futuro', async () => {
      const future = new Date(Date.now() + 60_000);
      repository.updateCampaign.mockResolvedValue(
        makeCampaign({ status: 'sending', scheduled_at: future }),
      );

      await service.send(CAMPAIGN_ID);

      expect(queue.add).toHaveBeenCalledWith(
        'process-batch',
        { campaignId: CAMPAIGN_ID },
        { delay: expect.any(Number) },
      );
    });

    it('sin REDIS_URL ejecuta el primer lote directo (fallback dev)', async () => {
      env.REDIS_URL = undefined;
      repository.getCampaignById.mockResolvedValue(makeCampaign({ total_recipients: 2 }));

      await service.send(CAMPAIGN_ID);
      await flush();

      expect(queue.add).not.toHaveBeenCalled();
      // El fallback recorrió el lote vacío y cerró la campaña como sent.
      expect(repository.updateCampaign).toHaveBeenCalledWith(CAMPAIGN_ID, {
        status: 'sent',
        sent_at: expect.any(Date),
      });
    });

    it('red de seguridad: campaña con 0 destinatarios reales nunca queda sent', async () => {
      env.REDIS_URL = undefined;
      repository.updateCampaign.mockResolvedValue(
        makeCampaign({ status: 'sending', total_recipients: 0 }),
      );

      await service.send(CAMPAIGN_ID);
      await flush();

      expect(repository.updateCampaign).toHaveBeenCalledWith(CAMPAIGN_ID, { status: 'failed' });
    });
  });

  describe('countAudience', () => {
    it('devuelve el alcance real de la campaña', async () => {
      const out = await service.countAudience(CAMPAIGN_ID);
      expect(recipients.resolve).toHaveBeenCalledWith(
        { segmentIds: ['seg-1'], includeUserIds: [], excludeUserIds: [] },
        'announcements',
      );
      expect(out).toEqual({ total: 2 });
    });
  });

  describe('cancel', () => {
    it('rechaza cancelar campañas ya cerradas', async () => {
      repository.getCampaignById.mockResolvedValue(makeCampaign({ status: 'sent' }));
      await expect(service.cancel(CAMPAIGN_ID)).rejects.toThrow(BadRequestException);
    });

    it('marca cancelled y devuelve el DTO', async () => {
      repository.updateCampaign.mockResolvedValue(makeCampaign({ status: 'cancelled' }));

      const out = await service.cancel(CAMPAIGN_ID);

      expect(out.status).toBe('cancelled');
      expect(out.id).toBe(CAMPAIGN_ID);
    });
  });

  describe('processTick', () => {
    it('dispara el envío de campañas programadas vencidas', async () => {
      repository.findDueScheduled.mockResolvedValue([makeCampaign({ status: 'scheduled' })]);

      await service.processTick();

      expect(repository.updateCampaign).toHaveBeenCalledWith(CAMPAIGN_ID, { status: 'sending' });
      expect(queue.add).toHaveBeenCalledWith('process-batch', { campaignId: CAMPAIGN_ID }, undefined);
    });

    it('marca failed la campaña programada cuyo envío falla', async () => {
      repository.findDueScheduled.mockResolvedValue([makeCampaign({ status: 'scheduled' })]);
      recipients.resolve.mockRejectedValue(new Error('db down'));

      await service.processTick();
      await flush();

      expect(repository.updateCampaign).toHaveBeenCalledWith(CAMPAIGN_ID, { status: 'failed' });
    });

    it('procesa lotes de campañas en sending', async () => {
      repository.listCampaigns.mockResolvedValue({
        rows: [makeCampaign({ status: 'sending', total_recipients: 3 })],
        total: 1,
      });
      repository.getCampaignById.mockResolvedValue(
        makeCampaign({ status: 'sending', total_recipients: 3 }),
      );

      const out = await service.processTick();

      expect(out.processed).toBe(0);
      // Lote vacío + cola vacía → cierra la campaña como sent.
      expect(repository.updateCampaign).toHaveBeenCalledWith(CAMPAIGN_ID, {
        status: 'sent',
        sent_at: expect.any(Date),
      });
    });
  });

  describe('processTransactionalBatch', () => {
    it('procesa solo transaccionales: renderiza, envía y marca sent', async () => {
      const send = makeSend({ type: 'transactional', source_type: 'business_verification' });
      repository.findPendingBatch.mockResolvedValue([send, makeSend()]);
      repository.markSent.mockResolvedValue(undefined);

      const processed = await service.processTransactionalBatch();

      expect(processed).toBe(1);
      expect(repository.markProcessing).toHaveBeenCalledWith('s-1');
      expect(renderer.renderVariables).toHaveBeenCalledWith('Hola {{nombre}}', send.variables_used);
      expect(resendSend).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'ana@correo.com', subject: 'Hola Ana' }),
      );
      expect(repository.markSent).toHaveBeenCalledWith('s-1', 're_1');
    });

    it('marca failed con el mensaje cuando el envío falla', async () => {
      repository.findPendingBatch.mockResolvedValue([
        makeSend({ type: 'transactional' }),
      ]);
      resendSend.mockRejectedValue(new Error('Credit insuficiente'));

      await service.processTransactionalBatch();

      expect(repository.markFailed).toHaveBeenCalledWith('s-1', 'Credit insuficiente');
      expect(repository.markSent).not.toHaveBeenCalled();
    });

    it('marca failed cuando la plantilla fue eliminada', async () => {
      repository.findPendingBatch.mockResolvedValue([
        makeSend({ type: 'transactional' }),
      ]);
      repository.findTemplateById.mockResolvedValue(null);

      await service.processTransactionalBatch();

      expect(repository.markFailed).toHaveBeenCalledWith('s-1', 'Plantilla no encontrada');
    });
  });

  describe('processBatch', () => {
    it('entrega cada envío del lote y marca sent con el resend id', async () => {
      const sendA = makeSend({ id: 's-1' });
      const sendB = makeSend({ id: 's-2', email: 'beto@correo.com' });
      repository.findQueuedBatch.mockResolvedValue([sendA, sendB]);
      resendSend.mockResolvedValue({ data: { id: 're_9' }, error: null });
      repository.countQueued.mockResolvedValue(1);

      const processed = await service.processBatch(makeCampaign({ status: 'sending' }));

      expect(processed).toBe(2);
      expect(repository.markSent).toHaveBeenCalledWith('s-1', 're_9');
      expect(repository.markSent).toHaveBeenCalledWith('s-2', 're_9');
      expect(repository.recountStats).toHaveBeenCalledWith(CAMPAIGN_ID);
      expect(repository.markFailed).not.toHaveBeenCalled();
    });

    it('re-encola el siguiente lote cuando quedan envíos en cola', async () => {
      repository.findQueuedBatch.mockResolvedValue([makeSend()]);
      repository.countQueued.mockResolvedValue(30);

      await service.processBatch(makeCampaign({ status: 'sending' }));

      expect(queue.add).toHaveBeenCalledWith('process-batch', { campaignId: CAMPAIGN_ID });
      expect(repository.updateCampaign).not.toHaveBeenCalled();
    });

    it('no re-encola sin REDIS_URL (fallback dev drena por tick)', async () => {
      env.REDIS_URL = undefined;
      repository.findQueuedBatch.mockResolvedValue([makeSend()]);
      repository.countQueued.mockResolvedValue(30);

      await service.processBatch(makeCampaign({ status: 'sending' }));

      expect(queue.add).not.toHaveBeenCalled();
    });

    it('usa el subject_override de la campaña sobre el de la plantilla', async () => {
      repository.findQueuedBatch.mockResolvedValue([makeSend()]);
      repository.countQueued.mockResolvedValue(1);
      repository.getCampaignById.mockResolvedValue(
        makeCampaign({ status: 'sending', subject_override: '  Lanzamos  ' }),
      );

      await service.processBatch(makeCampaign({ status: 'sending', subject_override: '  Lanzamos  ' }));

      expect(resendSend).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Lanzamos' }),
      );
    });

    it('falla el envío individual sin cortar el lote', async () => {
      const sendA = makeSend({ id: 's-1' });
      const sendB = makeSend({ id: 's-2' });
      repository.findQueuedBatch.mockResolvedValue([sendA, sendB]);
      resendSend
        .mockResolvedValueOnce({ data: null, error: { message: 'Credit insuficiente' } })
        .mockResolvedValue({ data: { id: 're_9' }, error: null });
      repository.countQueued.mockResolvedValue(1);

      await service.processBatch(makeCampaign({ status: 'sending' }));

      expect(repository.markFailed).toHaveBeenCalledWith('s-1', 'Credit insuficiente');
      expect(repository.markSent).toHaveBeenCalledWith('s-2', 're_9');
    });
  });

  describe('listSends', () => {
    it('mapea a DTO y pagina', async () => {
      repository.listSendsByCampaign.mockResolvedValue({
        rows: [makeSend({ status: 'sent' })],
        total: 1,
      });

      const out = (await service.listSends({
        campaignId: CAMPAIGN_ID,
        page: 1,
        limit: 20,
      })) as { data: { id: string }[]; meta: Record<string, unknown> };

      expect(repository.listSendsByCampaign).toHaveBeenCalledWith(CAMPAIGN_ID, {
        campaignId: CAMPAIGN_ID,
        page: 1,
        limit: 20,
      });
      expect(out.data[0]!.id).toBe('s-1');
      expect(out.meta).toEqual({ page: 1, limit: 20, total: 1 });
    });
  });
});
