import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CommissionsService } from './commissions.service';
import { CommissionsRepository } from './commissions.repository';

jest.mock('@0xc1x/role-commons', () => ({
  paginatedDataFromQuery: jest.fn(),
}));

const makeRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'b3e6c8f0-1a2b-3c4d-5e6f-7a8b9c0d1e2f',
  name: 'Test Business',
  slug: 'test-business',
  commission_rate: '0.1000',
  is_active: true,
  updated_at: new Date('2025-01-02T00:00:00Z'),
  has_pending_payouts: false,
  ...overrides,
});

describe('CommissionsService', () => {
  let service: CommissionsService;
  let repository: jest.Mocked<CommissionsRepository>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CommissionsService,
        {
          provide: CommissionsRepository,
          useValue: {
            transaction: jest.fn(),
            list: jest.fn(),
            findById: jest.fn(),
            hasPendingPayout: jest.fn(),
            updateCommissionRate: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(CommissionsService);
    repository = module.get(CommissionsRepository);

    // ponytail: run the transaction callback against the mocked repo directly
    repository.transaction.mockImplementation((fn) => fn(repository as never));
  });

  describe('update', () => {
    it('should update the commission rate', async () => {
      repository.findById.mockResolvedValue(makeRow() as never);
      repository.updateCommissionRate.mockResolvedValue(
        makeRow({ commission_rate: '0.1500' }) as never,
      );

      const result = await service.update(
        'b3e6c8f0-1a2b-3c4d-5e6f-7a8b9c0d1e2f',
        { commission_rate: 0.15 },
      );

      expect(result.commission_rate).toBe(0.15);
      expect(repository.hasPendingPayout).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when the business has pending/processing payouts', async () => {
      repository.findById.mockResolvedValue(
        makeRow({ has_pending_payouts: true }) as never,
      );

      await expect(
        service.update('b3e6c8f0-1a2b-3c4d-5e6f-7a8b9c0d1e2f', {
          commission_rate: 0.15,
        }),
      ).rejects.toThrow(ConflictException);

      expect(repository.updateCommissionRate).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for an unknown business', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.update('b3e6c8f0-1a2b-3c4d-5e6f-7a8b9c0d1e2f', {
          commission_rate: 0.15,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
