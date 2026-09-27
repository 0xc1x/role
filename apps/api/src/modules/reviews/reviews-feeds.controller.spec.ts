import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../../auth/auth.types';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { ReviewsFeedsController } from './reviews-feeds.controller';
import { ReviewsFeedsService } from './reviews-feeds.service';

describe('ReviewsFeedsController', () => {
  let controller: ReviewsFeedsController;
  let reflector: Reflector;
  let feeds: jest.Mocked<ReviewsFeedsService>;
  const user: AuthUser = { id: 'user-1', role: 'user', email: 'u@x.com' };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ReviewsFeedsController],
      providers: [
        {
          provide: ReviewsFeedsService,
          useValue: {
            listBusinessReviews: jest.fn(),
            listOfferReviews: jest.fn(),
            listMyReviews: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(ReviewsFeedsController);
    feeds = module.get(ReviewsFeedsService);
    reflector = module.get(Reflector);
  });

  it('the two public feeds delegate the path id and the query', async () => {
    const query = { page: 1, limit: 20 } as never;
    feeds.listBusinessReviews.mockResolvedValue({} as never);
    feeds.listOfferReviews.mockResolvedValue({} as never);

    controller.listBusinessReviews('biz-1', query);
    controller.listOfferReviews('off-1', query);

    expect(feeds.listBusinessReviews).toHaveBeenCalledWith('biz-1', query);
    expect(feeds.listOfferReviews).toHaveBeenCalledWith('off-1', query);
  });

  it('the my feed delegates with the authenticated user, never an id', () => {
    const query = { page: 2, limit: 10 } as never;

    controller.listMyReviews(user, query);

    expect(feeds.listMyReviews).toHaveBeenCalledWith(user, query);
  });

  describe('authorization', () => {
    it('the public feeds are public and the my feed is not', () => {
      expect(reflector.get(IS_PUBLIC_KEY, controller.listBusinessReviews)).toBe(
        true,
      );
      expect(reflector.get(IS_PUBLIC_KEY, controller.listOfferReviews)).toBe(
        true,
      );
      // No `@Public()`: the global AuthGuard is default-deny, so this route
      // requires a token.
      expect(reflector.get(IS_PUBLIC_KEY, controller.listMyReviews)).toBe(
        undefined,
      );
    });

    it('no route is role-restricted', () => {
      // Any authenticated role may read its own reviews, and the public feeds
      // have no role to check.
      for (const handler of [
        controller.listBusinessReviews,
        controller.listOfferReviews,
        controller.listMyReviews,
      ]) {
        expect(reflector.get(ROLES_KEY, handler)).toBeUndefined();
      }
    });
  });
});
