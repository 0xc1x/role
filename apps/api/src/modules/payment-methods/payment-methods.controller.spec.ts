import { Test } from '@nestjs/testing';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../../auth/auth.types';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { PaymentMethodsController } from './payment-methods.controller';
import { PaymentMethodsService } from './payment-methods.service';

const METHOD_NAMES: Record<RequestMethod, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.ALL]: 'ALL',
  [RequestMethod.OPTIONS]: 'OPTIONS',
  [RequestMethod.HEAD]: 'HEAD',
  [RequestMethod.SEARCH]: 'SEARCH',
};

describe('PaymentMethodsController', () => {
  let controller: PaymentMethodsController;
  let reflector: Reflector;
  let service: jest.Mocked<PaymentMethodsService>;
  const user: AuthUser = { id: 'user-1', role: 'user', email: 'u@x.cl' };
  const cardId = '3f1b7a52-0c1a-4a1e-9f2e-2b6c0d1a4e77';

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [PaymentMethodsController],
      providers: [
        {
          provide: PaymentMethodsService,
          useValue: {
            list: jest.fn(),
            setDefault: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(PaymentMethodsController);
    service = module.get(PaymentMethodsService);
    reflector = module.get(Reflector);
  });

  /**
   * The route table, read off the Nest metadata rather than off a comment: the
   * class-level prefix plus the per-handler path, with the global prefix
   * (`api/v1`, set in `main.ts`) prepended so the strings are the ones a client
   * actually calls.
   */
  const routes = (): string[] => {
    const prefix = Reflect.getMetadata(
      PATH_METADATA,
      PaymentMethodsController,
    ) as string;
    const own = Object.getOwnPropertyNames(
      PaymentMethodsController.prototype,
    ).filter((name) => name !== 'constructor');
    return own
      .filter((name) => Reflect.getMetadata(PATH_METADATA, controller[name]))
      .map((name) => {
        const method = Reflect.getMetadata(
          METHOD_METADATA,
          controller[name],
        ) as RequestMethod;
        const path = Reflect.getMetadata(
          PATH_METADATA,
          controller[name],
        ) as string;
        const segments = [prefix, path === '/' ? '' : path].filter(Boolean);
        return `${METHOD_NAMES[method]} /api/v1/${segments.join('/')}`;
      })
      .sort();
  };

  it('exposes exactly three routes, and no create', () => {
    // THE SCOPE, PINNED AT THE ROUTE TABLE. ADR-0007 keeps the add-a-card path
    // behind the gateway SDK, so there is no POST here — a create would need a
    // gateway_token in a request body, the one field the contract may not carry.
    // If a fourth verb ever appears, this is the test that should fail first.
    expect(routes()).toEqual([
      'DELETE /api/v1/payment-methods/:id',
      'GET /api/v1/payment-methods',
      'PUT /api/v1/payment-methods/:id/default',
    ]);
  });

  it('has no route that creates a payment method', () => {
    // Stated separately from the table above because the failure this guards
    // against is an ADDED route, and a reader scanning the list would not
    // notice a fourth line the way they would not notice a missing assertion.
    expect(routes().some((r) => r.startsWith('POST'))).toBe(false);
  });

  it('no route is public: the global AuthGuard is default-deny', () => {
    for (const handler of Object.values(controller)) {
      if (typeof handler !== 'function') continue;
      expect(reflector.get(IS_PUBLIC_KEY, handler)).toBeUndefined();
    }
  });

  it('no route is role-restricted — this is a consumer surface', () => {
    // A business account managing its own cards is not an admin action, and the
    // table's single RLS policy carries no admin bypass, so these routes widen
    // nothing.
    for (const handler of Object.values(controller)) {
      if (typeof handler !== 'function') continue;
      expect(reflector.get(ROLES_KEY, handler)).toBeUndefined();
    }
  });

  it('every handler delegates the token subject, and no handler takes an owner', () => {
    service.list.mockResolvedValue([]);
    service.setDefault.mockResolvedValue(undefined as never);
    service.remove.mockResolvedValue(undefined);

    controller.list(user);
    controller.setDefault(user, cardId);
    controller.remove(user, cardId);

    // The user passed through is the one the service was given, on all three
    // routes. There is no other argument that could name an account.
    expect(service.list).toHaveBeenCalledWith(user);
    expect(service.setDefault).toHaveBeenCalledWith(user, cardId);
    expect(service.remove).toHaveBeenCalledWith(user, cardId);
  });

  it('no handler takes a user_id, a gateway_token, or any other body', () => {
    // The strongest form of "the owner cannot come from the request": this
    // controller declares no `@Body` at all, so there is no request body to
    // strip a `user_id` from and no `gateway_token` a caller could ever send.
    // Arity is what proves it — the token subject plus, at most, one card id.
    // Adding a DTO parameter to any of these three signatures fails here.
    expect(PaymentMethodsController.prototype.list.length).toBe(1);
    expect(PaymentMethodsController.prototype.setDefault.length).toBe(2);
    expect(PaymentMethodsController.prototype.remove.length).toBe(2);
  });
});
