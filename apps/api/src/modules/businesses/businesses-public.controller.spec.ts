import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import type {
  ListPublicBusinessesQuery,
  PublicBusinessPaginatedData,
  PublicBusinessStorefrontDto,
} from '@0xc1x/role-commons';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { BusinessesPublicController } from './businesses-public.controller';
import { BusinessesPublicService } from './businesses-public.service';

describe('BusinessesPublicController', () => {
  let controller: BusinessesPublicController;
  let reflector: Reflector;
  let service: jest.Mocked<BusinessesPublicService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [BusinessesPublicController],
      providers: [
        {
          provide: BusinessesPublicService,
          useValue: { list: jest.fn(), storefront: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(BusinessesPublicController);
    service = module.get(BusinessesPublicService);
    reflector = module.get(Reflector);
  });

  it('list delegates the validated query', async () => {
    const query: ListPublicBusinessesQuery = {
      page: 1,
      limit: 20,
      search: 'pan',
    };
    const paginated: PublicBusinessPaginatedData = {
      data: [],
      meta: { page: 1, limit: 20, total: 0, total_pages: 0 },
    };
    service.list.mockResolvedValue(paginated);

    await expect(controller.list(query)).resolves.toBe(paginated);
    expect(service.list).toHaveBeenCalledWith(query);
  });

  it('storefront delegates the id', async () => {
    const storefront = { business: {}, locations: [], hours: [] } as never;
    service.storefront.mockResolvedValue(storefront);

    await expect(controller.storefront('biz-1')).resolves.toBe(storefront);
    expect(service.storefront).toHaveBeenCalledWith('biz-1');
  });

  describe('authorization', () => {
    it('both reads are public and neither is role-restricted', () => {
      // The global AuthGuard is default-deny, so `@Public()` is the whole grant
      // and the absent role list is what makes this a consumer surface rather
      // than an admin one.
      expect(reflector.get(IS_PUBLIC_KEY, controller.list)).toBe(true);
      expect(reflector.get(IS_PUBLIC_KEY, controller.storefront)).toBe(true);
      expect(reflector.get(ROLES_KEY, controller.list)).toBeUndefined();
      expect(reflector.get(ROLES_KEY, controller.storefront)).toBeUndefined();
    });
  });
});
