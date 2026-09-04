import { Test } from '@nestjs/testing';
import { RecipientsService } from './recipients.service';
import { EmailMarketingRepository } from './email-marketing.repository';

describe('RecipientsService', () => {
  let service: RecipientsService;
  let repository: jest.Mocked<EmailMarketingRepository>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RecipientsService,
        {
          provide: EmailMarketingRepository,
          useValue: {
            findSegmentById: jest.fn(),
            getSegmentUserIds: jest.fn(),
            findIdsMatchingFilters: jest.fn(),
            findSubscribedRecipients: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(RecipientsService);
    repository = module.get(EmailMarketingRepository);
    jest.resetAllMocks();
  });

  describe('resolveUserIds', () => {
    it('arranca con los include y agrega usuarios de segmentos estáticos', async () => {
      repository.findSegmentById.mockImplementation(async (id) =>
        id === 'seg-1'
          ? ({
              id: 'seg-1',
              type: 'static',
              is_active: true,
              category: 'announcements',
            } as never)
          : null,
      );
      repository.getSegmentUserIds.mockResolvedValue(['u-2', 'u-3']);

      const ids = await service.resolveUserIds(
        {
          segmentIds: ['seg-1'],
          includeUserIds: ['u-1'],
          excludeUserIds: [],
        },
        'announcements',
      );

      expect(ids).toEqual(expect.arrayContaining(['u-1', 'u-2', 'u-3']));
      expect(ids).toHaveLength(3);
    });

    it('ignora segmentos inactivos y de otra categoría cuando hay categoría', async () => {
      repository.findSegmentById.mockImplementation(async (id) =>
        id === 'seg-inactivo'
          ? ({ id, type: 'static', is_active: false, category: 'announcements' } as never)
          : ({ id, type: 'static', is_active: true, category: 'promotions' } as never),
      );
      repository.getSegmentUserIds.mockResolvedValue(['u-2']);

      const ids = await service.resolveUserIds(
        {
          segmentIds: ['seg-inactivo', 'seg-promos'],
          includeUserIds: ['u-1'],
          excludeUserIds: [],
        },
        'announcements',
      );

      expect(repository.getSegmentUserIds).not.toHaveBeenCalled();
      expect(ids).toEqual(['u-1']);
    });

    it('sin categoría resuelve todos los segmentos activos (canal push)', async () => {
      repository.findSegmentById.mockResolvedValue({
        id: 'seg-1',
        type: 'static',
        is_active: true,
        category: 'promotions',
      } as never);
      repository.getSegmentUserIds.mockResolvedValue(['u-2']);

      const ids = await service.resolveUserIds({
        segmentIds: ['seg-1'],
        includeUserIds: [],
        excludeUserIds: [],
      });

      expect(ids).toEqual(['u-2']);
    });

    it('segmento dinámico: solo aplica filtros de campos conocidos', async () => {
      repository.findSegmentById.mockResolvedValue({
        id: 'seg-dyn',
        type: 'dynamic',
        is_active: true,
        category: 'announcements',
        filters: {
          and: [
            { field: 'city', op: 'eq', value: 'CDMX' },
            { field: 'hacker_field', op: 'eq', value: 'x' },
          ],
        },
      } as never);
      repository.findIdsMatchingFilters.mockResolvedValue(['u-5']);

      const ids = await service.resolveUserIds(
        {
          segmentIds: ['seg-dyn'],
          includeUserIds: [],
          excludeUserIds: [],
        },
        'announcements',
      );

      expect(repository.findIdsMatchingFilters).toHaveBeenCalledWith([
        { field: 'city', op: 'eq', value: 'CDMX' },
      ]);
      expect(ids).toEqual(['u-5']);
    });

    it('exclude elimina usuarios ya resueltos', async () => {
      repository.findSegmentById.mockResolvedValue({
        id: 'seg-1',
        type: 'static',
        is_active: true,
        category: 'announcements',
      } as never);
      repository.getSegmentUserIds.mockResolvedValue(['u-1', 'u-2']);

      const ids = await service.resolveUserIds(
        {
          segmentIds: ['seg-1'],
          includeUserIds: ['u-3'],
          excludeUserIds: ['u-2'],
        },
        'announcements',
      );

      expect(ids).toEqual(expect.arrayContaining(['u-1', 'u-3']));
      expect(ids).not.toContain('u-2');
    });
  });

  describe('resolve', () => {
    it('filtra por suscripción a la categoría y deduplica por email', async () => {
      repository.findSegmentById.mockResolvedValue(null);
      repository.findSubscribedRecipients.mockResolvedValue([
        { user_id: 'u-1', email: 'ana@correo.com', full_name: 'Ana' },
        { user_id: 'u-2', email: 'ana@correo.com', full_name: 'Ana Dup' },
        { user_id: 'u-3', email: 'beto@correo.com', full_name: null },
      ]);

      const recipients = await service.resolve(
        { segmentIds: [], includeUserIds: ['u-1', 'u-2', 'u-3'], excludeUserIds: [] },
        'announcements',
      );

      expect(recipients).toEqual([
        { userId: 'u-1', email: 'ana@correo.com', fullName: 'Ana' },
        { userId: 'u-3', email: 'beto@correo.com', fullName: null },
      ]);
    });

    it('descarta filas sin email', async () => {
      repository.findSegmentById.mockResolvedValue(null);
      repository.findSubscribedRecipients.mockResolvedValue([
        { user_id: 'u-1', email: '', full_name: 'Sin email' },
        { user_id: 'u-2', email: 'ana@correo.com', full_name: 'Ana' },
      ]);

      const recipients = await service.resolve(
        { segmentIds: [], includeUserIds: ['u-1', 'u-2'], excludeUserIds: [] },
        'announcements',
      );

      expect(recipients).toHaveLength(1);
      expect(recipients[0]!.email).toBe('ana@correo.com');
    });
  });
});
