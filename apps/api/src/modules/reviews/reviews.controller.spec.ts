import { Test } from '@nestjs/testing';
import type { AuthUser } from '../../auth/auth.types';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

describe('ReviewsController', () => {
  let controller: ReviewsController;
  let service: jest.Mocked<ReviewsService>;
  const user: AuthUser = { id: 'user-1', role: 'user', email: 'u@x.com' };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ReviewsController],
      providers: [{ provide: ReviewsService, useValue: { create: jest.fn() } }],
    }).compile();

    controller = module.get(ReviewsController);
    service = module.get(ReviewsService);
  });

  it('create delega con el usuario autenticado', () => {
    const body = { order_id: 'ord-1', business_rating: 5 } as never;
    controller.create(user, body);
    expect(service.create).toHaveBeenCalledWith(user, body);
  });
});
