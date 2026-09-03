import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { OffersService } from './offers.service';
import { OffersRepository } from './offers.repository';

describe('OffersService.expireStale (espejo de check_offer_expiry)', () => {
  let service: OffersService;
  const expireStale = jest.fn();

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OffersService,
        { provide: OffersRepository, useValue: { expireStale } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    service = module.get(OffersService);
    jest.resetAllMocks();
  });

  it('retorna la cantidad de ofertas desactivadas', async () => {
    expireStale.mockResolvedValue(4);

    await expect(service.expireStale()).resolves.toEqual({ expired: 4 });
  });

  it('sin ofertas vencidas → 0', async () => {
    expireStale.mockResolvedValue(0);

    await expect(service.expireStale()).resolves.toEqual({ expired: 0 });
  });
});
