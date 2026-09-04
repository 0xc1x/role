jest.mock('juice', () => ({
  __esModule: true,
  default: jest.fn((html: string) => html),
}));

jest.mock('@0xc1x/role-commons', () => ({
  AddSegmentUsersSchema: {},
  CreateCampaignSchema: {},
  CreateEmailComponentSchema: {},
  CreateEmailTemplateSchema: {},
  CreateSegmentSchema: {},
  ListCampaignsQuerySchema: {},
  ListComponentsQuerySchema: {},
  ListSegmentsQuerySchema: {},
  ListSendsQuerySchema: {},
  TestCampaignSchema: {},
  UpdateCampaignSchema: {},
  UpdateEmailComponentSchema: {},
  UpdateEmailTemplateSchema: {},
  UpdateSegmentSchema: {},
}));

import { Test } from '@nestjs/testing';
import { EmailMarketingController } from './email-marketing.controller';
import { CampaignsService } from './campaigns.service';
import {
  EmailMarketingRepository,
  type CampaignRow,
  type ComponentRow,
  type SendRow,
} from './email-marketing.repository';

const CAMPAIGN_ID = 'b3e6c8f0-1a2b-3c4d-5e6f-7a8b9c0d1e2f';

const makeCampaign = (overrides: Partial<CampaignRow> = {}): CampaignRow =>
  ({
    id: CAMPAIGN_ID,
    name: 'Campaña',
    description: null,
    template_id: null,
    subject_override: null,
    body_override: null,
    category: 'announcements',
    segment_ids: [],
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

const makeComponent = (overrides: Partial<ComponentRow> = {}): ComponentRow =>
  ({
    id: 'c0a5a5a5-1a2b-3c4d-5e6f-7a8b9c0d1e2f',
    name: 'Header',
    description: null,
    type: 'header',
    html_content: '<header>H</header>',
    is_active: true,
    created_at: new Date('2025-01-01T00:00:00Z'),
    updated_at: new Date('2025-01-01T00:00:00Z'),
    deleted_at: null,
    ...overrides,
  }) as ComponentRow;

const makeSend = (overrides: Partial<SendRow> = {}): SendRow =>
  ({
    id: 's-1',
    type: 'campaign',
    source_type: 'campaign',
    source_id: CAMPAIGN_ID,
    template_id: 't-1',
    user_id: 'u-1',
    email: 'ana@correo.com',
    variables_used: {},
    resend_id: null,
    status: 'pending',
    attempts: 0,
    max_attempts: 5,
    error_message: null,
    error_code: null,
    scheduled_at: null,
    queued_at: null,
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

describe('EmailMarketingController', () => {
  let controller: EmailMarketingController;
  let repository: jest.Mocked<EmailMarketingRepository>;
  let campaignsService: jest.Mocked<Pick<CampaignsService, 'preview' | 'test' | 'testTemplate' | 'countAudience' | 'send' | 'cancel' | 'listSends'>>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [EmailMarketingController],
      providers: [
        {
          provide: EmailMarketingRepository,
          useValue: {
            listComponents: jest.fn(),
            insertComponent: jest.fn(),
            updateComponent: jest.fn(),
            deleteComponent: jest.fn(),
            listTemplates: jest.fn(),
            insertTemplate: jest.fn(),
            updateTemplate: jest.fn(),
            deleteTemplate: jest.fn(),
            listSegments: jest.fn(),
            insertSegment: jest.fn(),
            updateSegment: jest.fn(),
            deleteSegment: jest.fn(),
            getSegmentUserIds: jest.fn(),
            replaceSegmentUsers: jest.fn(),
            addSegmentUsers: jest.fn(),
            listCampaigns: jest.fn(),
            getCampaignById: jest.fn(),
            insertCampaign: jest.fn(),
            updateCampaign: jest.fn(),
            deleteCampaign: jest.fn(),
            listSends: jest.fn(),
            findSendById: jest.fn(),
            updateSend: jest.fn(),
          },
        },
        {
          provide: CampaignsService,
          useValue: {
            preview: jest.fn(),
            test: jest.fn(),
            testTemplate: jest.fn(),
            countAudience: jest.fn(),
            send: jest.fn(),
            cancel: jest.fn(),
            listSends: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(EmailMarketingController);
    repository = module.get(EmailMarketingRepository);
    campaignsService = module.get(CampaignsService);
    jest.clearAllMocks();
  });

  describe('campaigns: create/update con auditoría y fechas', () => {
    it('createCampaign inyecta created_by y convierte scheduled_at a Date', () => {
      const body = {
        name: 'Lanzamiento',
        category: 'announcements',
        segment_ids: ['seg-1'],
        scheduled_at: '2025-06-01T10:00:00.000Z',
      };

      controller.createCampaign({ id: 'admin-1' } as never, body as never);

      expect(repository.insertCampaign).toHaveBeenCalledWith({
        ...body,
        created_by: 'admin-1',
        scheduled_at: new Date('2025-06-01T10:00:00.000Z'),
      });
    });

    it('createCampaign sin scheduled_at guarda null', () => {
      controller.createCampaign({ id: 'admin-1' } as never, {
        name: 'Lanzamiento',
        category: 'announcements',
      } as never);

      expect(repository.insertCampaign).toHaveBeenCalledWith(
        expect.objectContaining({ scheduled_at: null }),
      );
    });

    it('updateCampaign convierte scheduled_at cuando viene', () => {
      controller.updateCampaign(CAMPAIGN_ID, {
        scheduled_at: '2025-06-01T10:00:00.000Z',
      } as never);

      expect(repository.updateCampaign).toHaveBeenCalledWith(CAMPAIGN_ID, {
        scheduled_at: new Date('2025-06-01T10:00:00.000Z'),
      });
    });

    it('updateCampaign con scheduled_at null la desprograma', () => {
      controller.updateCampaign(CAMPAIGN_ID, { scheduled_at: null } as never);

      expect(repository.updateCampaign).toHaveBeenCalledWith(CAMPAIGN_ID, {
        scheduled_at: null,
      });
    });

    it('updateCampaign sin scheduled_at no toca el campo', () => {
      controller.updateCampaign(CAMPAIGN_ID, { name: 'Nuevo nombre' } as never);

      expect(repository.updateCampaign).toHaveBeenCalledWith(CAMPAIGN_ID, {
        name: 'Nuevo nombre',
      });
    });
  });

  describe('getCampaign', () => {
    it('mapea la fila a DTO', async () => {
      repository.getCampaignById.mockResolvedValue(makeCampaign());

      const out = await controller.getCampaign(CAMPAIGN_ID);

      expect(out).toEqual(
        expect.objectContaining({ id: CAMPAIGN_ID, status: 'draft', name: 'Campaña' }),
      );
    });

    it('devuelve null cuando no existe', async () => {
      repository.getCampaignById.mockResolvedValue(null);
      await expect(controller.getCampaign(CAMPAIGN_ID)).resolves.toBeNull();
    });
  });

  describe('previewCampaign', () => {
    it('delega con los overrides guardados de la campaña', async () => {
      repository.getCampaignById.mockResolvedValue(
        makeCampaign({
          template_id: 't-1',
          subject_override: 'Asunto guardado',
          body_override: '<p>Body guardado</p>',
        }),
      );
      campaignsService.preview.mockResolvedValue({ subject: 'x', html: 'y', variables_used: [] });

      await controller.previewCampaign(CAMPAIGN_ID);

      expect(campaignsService.preview).toHaveBeenCalledWith({
        templateId: 't-1',
        subjectOverride: 'Asunto guardado',
        bodyOverride: '<p>Body guardado</p>',
      });
    });

    it('falla si la campaña no tiene plantilla', async () => {
      repository.getCampaignById.mockResolvedValue(makeCampaign({ template_id: null }));
      await expect(controller.previewCampaign(CAMPAIGN_ID)).rejects.toThrow(
        'La campaña no tiene plantilla',
      );
    });
  });

  describe('delegaciones de campañas', () => {
    it('send / cancel / audience / test delegan en el servicio', async () => {
      const dto = { id: CAMPAIGN_ID } as never;
      campaignsService.send.mockResolvedValue(dto);
      campaignsService.cancel.mockResolvedValue(dto);
      campaignsService.countAudience.mockResolvedValue({ total: 7 });
      campaignsService.test.mockResolvedValue({ sent: 1 });
      campaignsService.testTemplate.mockResolvedValue({ sent: 2 });

      await controller.sendCampaign(CAMPAIGN_ID);
      await controller.cancelCampaign(CAMPAIGN_ID);
      await controller.audience(CAMPAIGN_ID);
      await controller.testCampaign(CAMPAIGN_ID, { emails: ['a@x.com'] } as never);
      await controller.testTemplate('t-1', { emails: ['a@x.com'] } as never);

      expect(campaignsService.send).toHaveBeenCalledWith(CAMPAIGN_ID);
      expect(campaignsService.cancel).toHaveBeenCalledWith(CAMPAIGN_ID);
      expect(campaignsService.countAudience).toHaveBeenCalledWith(CAMPAIGN_ID);
      expect(campaignsService.test).toHaveBeenCalledWith(CAMPAIGN_ID, { emails: ['a@x.com'] });
      expect(campaignsService.testTemplate).toHaveBeenCalledWith('t-1', ['a@x.com']);
    });

    it('listSends pasa el query completo al servicio', () => {
      controller.listSends(CAMPAIGN_ID, { page: 2, limit: 10 } as never);
      expect(campaignsService.listSends).toHaveBeenCalledWith({
        campaignId: CAMPAIGN_ID,
        page: 2,
        limit: 10,
      });
    });

    it('removeCampaign hace soft delete', () => {
      repository.deleteCampaign.mockResolvedValue(true);
      controller.removeCampaign(CAMPAIGN_ID);
      expect(repository.deleteCampaign).toHaveBeenCalledWith(CAMPAIGN_ID);
    });
  });

  describe('sends', () => {
    it('listAllSends mapea filas a DTO', async () => {
      repository.listSends.mockResolvedValue({ rows: [makeSend()], total: 1 });

      const out = (await controller.listAllSends({ page: 1, limit: 10 } as never)) as {
        data: { id: string }[];
        meta: { total: number };
      };

      expect(out.data[0]!.id).toBe('s-1');
      expect(out.meta.total).toBe(1);
    });

    it('retrySend re-arma el envío para reintento', async () => {
      repository.findSendById.mockResolvedValue(makeSend({ status: 'failed', attempts: 5 }));

      const out = await controller.retrySend('s-1');

      expect(repository.updateSend).toHaveBeenCalledWith(
        's-1',
        expect.objectContaining({ status: 'pending', attempts: 0, error_message: null }),
      );
      expect(out).toEqual({ ok: true });
    });

    it('retrySend falla si el envío no existe', async () => {
      repository.findSendById.mockResolvedValue(null);
      await expect(controller.retrySend('nope')).rejects.toThrow('Envío no encontrado');
    });
  });

  describe('segmentos', () => {
    it('createSegment crea y agrega miembros cuando vienen user_ids', async () => {
      repository.insertSegment.mockResolvedValue([
        makeComponent({ id: 'seg-1' }) as never,
      ]);

      await controller.createSegment({
        name: 'CDMX',
        user_ids: ['u-1', 'u-2'],
      } as never);

      expect(repository.insertSegment).toHaveBeenCalledWith(
        expect.not.objectContaining({ user_ids: expect.anything() }),
      );
      expect(repository.addSegmentUsers).toHaveBeenCalledWith('seg-1', ['u-1', 'u-2']);
    });

    it('createSegment sin user_ids no toca miembros', async () => {
      repository.insertSegment.mockResolvedValue([makeComponent({ id: 'seg-1' }) as never]);

      await controller.createSegment({ name: 'Todos' } as never);

      expect(repository.addSegmentUsers).not.toHaveBeenCalled();
    });

    it('getSegmentUsers devuelve los ids', async () => {
      repository.getSegmentUserIds.mockResolvedValue(['u-1']);
      await expect(controller.getSegmentUsers('seg-1')).resolves.toEqual(['u-1']);
    });
  });

  describe('componentes', () => {
    it('listComponents mapea a DTO con meta', async () => {
      repository.listComponents.mockResolvedValue({ rows: [makeComponent()], total: 1 });

      const out = (await controller.listComponents({ page: 1, limit: 10 } as never)) as {
        data: { id: string }[];
        meta: { total: number };
      };

      expect(out.data[0]!.id).toBe('c0a5a5a5-1a2b-3c4d-5e6f-7a8b9c0d1e2f');
      expect(out.meta).toEqual({ page: 1, limit: 10, total: 1 });
    });
  });

  describe('EmailMarketingController (componentes/plantillas/segmentos)', () => {
    const tplRow = {
      id: 't1',
      name: 'T',
      description: null,
      subject: 'S',
      body_html: 'B',
      header_id: null,
      footer_id: null,
      variables: [],
      is_active: true,
      created_at: new Date('2025-01-01T00:00:00Z'),
      updated_at: new Date('2025-01-01T00:00:00Z'),
      deleted_at: null,
    };
    const segRow = {
      id: 's1',
      name: 'VIP',
      description: null,
      type: 'static',
      filters: null,
      is_active: true,
      estimated_count: 0,
      category: 'announcements',
      created_at: new Date('2025-01-01T00:00:00Z'),
      updated_at: new Date('2025-01-01T00:00:00Z'),
      deleted_at: null,
    };

    it('componentes: create/update/remove delegan', async () => {
      const comp = makeComponent();
      repository.insertComponent.mockResolvedValue(comp);
      await expect(controller.createComponent({} as never)).resolves.toBe(comp);
      repository.updateComponent.mockResolvedValue(comp);
      await expect(
        controller.updateComponent(comp.id, {} as never),
      ).resolves.toBe(comp);
      repository.deleteComponent.mockResolvedValue(true);
      await expect(controller.removeComponent(comp.id)).resolves.toBe(true);
    });

    it('plantillas: list/create/update/remove + render/test delegan', async () => {
      repository.listTemplates.mockResolvedValue({ rows: [tplRow], total: 1 });
      const listed = await controller.listTemplates({ page: 1, limit: 10 } as never);
      expect(listed.data).toHaveLength(1);
      repository.insertTemplate.mockResolvedValue([tplRow]);
      const created = await controller.createTemplate({} as never);
      expect(created).toMatchObject({ id: 't1' });
      repository.updateTemplate.mockResolvedValue(tplRow);
      expect(
        await controller.updateTemplate('t1', {} as never),
      ).toMatchObject({ id: 't1' });
      repository.updateTemplate.mockResolvedValue(null);
      expect(await controller.updateTemplate('t1', {} as never)).toBeNull();
      repository.deleteTemplate.mockResolvedValue(true);
      await expect(controller.removeTemplate('t1')).resolves.toBe(true);

      campaignsService.testTemplate.mockResolvedValue({ ok: true });
      await controller.renderPreview('t1');
      expect(campaignsService.preview).toHaveBeenCalledWith({ templateId: 't1' });
      await controller.testTemplate('t1', { emails: ['a@b.cl'] } as never);
      expect(campaignsService.testTemplate).toHaveBeenCalledWith('t1', ['a@b.cl']);
    });

    it('segmentos: list/update/remove/set/add delegan', async () => {
      repository.listSegments.mockResolvedValue({ rows: [segRow], total: 1 });
      const listed = await controller.listSegments({ page: 1, limit: 10 } as never);
      expect(listed.data).toHaveLength(1);
      repository.updateSegment.mockResolvedValue(segRow);
      await expect(controller.updateSegment('s1', {} as never)).resolves.toBe(segRow);
      repository.deleteSegment.mockResolvedValue(true);
      await expect(controller.removeSegment('s1')).resolves.toBe(true);
      repository.replaceSegmentUsers.mockResolvedValue(undefined);
      await controller.setSegmentUsers('s1', { user_ids: ['u1'] });
      expect(repository.replaceSegmentUsers).toHaveBeenCalledWith('s1', ['u1']);
      repository.addSegmentUsers.mockResolvedValue(undefined);
      await controller.addSegmentUsers('s1', { user_ids: ['u2'] });
      expect(repository.addSegmentUsers).toHaveBeenCalledWith('s1', ['u2']);
    });

    it('updateSend delega y mapea', async () => {
      repository.updateSend.mockResolvedValue(makeSend());
      await expect(controller.updateSend('s-1', {} as never)).resolves.toMatchObject({
        id: 's-1',
      });
      repository.updateSend.mockResolvedValue(null);
      await expect(controller.updateSend('s-1', {} as never)).resolves.toBeNull();
    });
  });
});

describe('EmailMarketingController.listCampaigns', () => {
  test('mapea filas a DTO con meta', async () => {
    const module = await Test.createTestingModule({
      controllers: [EmailMarketingController],
      providers: [
        {
          provide: EmailMarketingRepository,
          useValue: {
            listCampaigns: jest.fn(async () => ({ rows: [makeCampaign()], total: 1 })),
          },
        },
        {
          provide: CampaignsService,
          useValue: {},
        },
      ],
    }).compile();
    const controller = module.get(EmailMarketingController);
    const out = await controller.listCampaigns({ page: 1, limit: 10 } as never);
    expect(out.data).toHaveLength(1);
    expect(out.meta).toEqual({ page: 1, limit: 10, total: 1 });
  });
});
