import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  BusinessSubscriptionSchema,
  SubscriptionPlanSchema,
} from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import {
  SubscriptionsRepository,
  type PlanEntry,
  type SubscriptionEntry,
} from './subscriptions.repository';
import { SubscriptionsService } from './subscriptions.service';

const BIZ = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const MISSING_BIZ = '3b1c9d20-1f4e-4a6b-9c11-77aa11bb22cc';

const OWNER_USER = '00000000-0000-4000-8000-000000000001';
const MANAGER_USER = '00000000-0000-4000-8000-000000000002';
const STAFF_USER = '00000000-0000-4000-8000-000000000003';
const ADMIN_USER = '00000000-0000-4000-8000-000000000005';

const owner: AuthUser = { id: OWNER_USER, role: 'business', email: null };
const manager: AuthUser = { id: MANAGER_USER, role: 'business', email: null };
const staff: AuthUser = { id: STAFF_USER, role: 'business', email: null };
const admin: AuthUser = { id: ADMIN_USER, role: 'admin', email: null };

/**
 * El catálogo, como son las filas que tiene.
 *
 * Los números son los del §4.5 y están escritos AQUÍ, en el fixture, y no
 * importados de `packages/commons`: el espejo es una copia, y una prueba que
 * compara la API contra la copia no puede notar que la copia se apartó. Lo que
 * este archivo fija es que la API conteste con los números que salieron de la
 * TABLA.
 */
const freePlan: PlanEntry = {
  code: 'free',
  audience: 'business',
  max_locations: 1,
  max_members: 2,
  is_active: true,
  features: ['staff_access'],
};

const proPlan: PlanEntry = {
  code: 'pro',
  audience: 'business',
  max_locations: 5,
  max_members: 20,
  is_active: true,
  features: ['staff_access', 'payments'],
};

/** Un plan retirado de la oferta: la fila existe, pero no se vende. */
const retiredPlan: PlanEntry = { ...proPlan, is_active: false };

const SINCE = new Date('2026-10-01T12:00:00.000Z');

/**
 * La suscripción viva de un negocio, con la fila del catálogo de su plan.
 *
 * Las dos van SEPARADAS a propósito: la suscripción dice QUÉ plan y el
 * catálogo dice QUÉ incluye, y una respuesta que mezclara los dos no dejaría
 * ver de dónde salió cada número.
 */
function subscriptionEntry(
  overrides: Partial<SubscriptionEntry> = {},
): SubscriptionEntry {
  return {
    plan_code: 'pro',
    started_at: SINCE,
    plan: proPlan,
    ...overrides,
  };
}

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let repository: Record<string, ReturnType<typeof jest.fn>>;
  let logs: Record<string, unknown>[];

  beforeEach(async () => {
    repository = {
      listActivePlans: jest.fn(async () => [freePlan, proPlan]),
      findPlan: jest.fn(async (code: string) =>
        code === 'pro' ? proPlan : freePlan,
      ),
      findBusinessSubscription: jest.fn(async () => subscriptionEntry()),
      businessExists: jest.fn(async () => true),
      roleOf: jest.fn(async (_businessId: string, userId: string) => {
        if (userId === OWNER_USER) return 'owner';
        if (userId === MANAGER_USER) return 'manager';
        if (userId === STAFF_USER) return 'staff';
        return null;
      }),
      updateLiveSubscription: jest.fn(async () => null),
      insertBusinessSubscription: jest.fn(async () => ({
        id: 'sub-1',
        business_id: BIZ,
        user_id: null,
        plan_code: 'pro',
        started_at: SINCE,
        cancelled_at: null,
        deleted_at: null,
        created_at: SINCE,
        updated_at: SINCE,
      })),
    };

    const module = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: SubscriptionsRepository, useValue: repository },
      ],
    }).compile();

    service = module.get(SubscriptionsService);

    logs = [];
    (service as unknown as { logger: unknown }).logger = {
      log: (entry: Record<string, unknown>) => logs.push(entry),
      warn: (entry: Record<string, unknown>) => logs.push(entry),
      error: (entry: Record<string, unknown>) => logs.push(entry),
      debug: (entry: Record<string, unknown>) => logs.push(entry),
    };
  });

  // ─────────────────────────── el catálogo ───────────────────────────

  describe('el catálogo', () => {
    it('devuelve los planes que la base tiene, con sus límites y sus features', async () => {
      const plans = await service.listPlans();

      expect(plans).toHaveLength(2);
      expect(plans[0]).toEqual({
        code: 'free',
        audience: 'business',
        limits: { max_locations: 1, max_members: 2 },
        features: ['staff_access'],
      });
      expect(plans[1]).toEqual({
        code: 'pro',
        audience: 'business',
        limits: { max_locations: 5, max_members: 20 },
        features: ['staff_access', 'payments'],
      });
      // Y cada plan cumple el contrato de `packages/commons`: el mapper no
      // inventa campos ni deja ninguno fuera.
      for (const plan of plans) {
        expect(SubscriptionPlanSchema.parse(plan)).toEqual(plan);
      }
    });
  });

  // ─────────────────────── ver el plan del negocio ───────────────────────

  describe('ver el plan del negocio', () => {
    it('un empleado recibe 403, y no se lee nada', async () => {
      await expect(
        service.getBusinessSubscription(staff, BIZ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.getBusinessSubscription(staff, BIZ)).rejects.toThrow(
        'Ver el plan del negocio es del dueño o su gerente.',
      );
      expect(repository.findBusinessSubscription).not.toHaveBeenCalled();
    });

    it('un gerente entra, y la respuesta es la de su negocio', async () => {
      const dto = await service.getBusinessSubscription(manager, BIZ);

      expect(dto.plan_code).toBe('pro');
      expect(dto.business_id).toBe(BIZ);
      expect(dto.since).toBe(SINCE.toISOString());
      expect(dto.limits).toEqual({ max_locations: 5, max_members: 20 });
      expect(dto.features).toEqual(['staff_access', 'payments']);
      expect(BusinessSubscriptionSchema.parse(dto)).toEqual(dto);
    });

    it('un admin de plataforma entra, y no necesita membresía', async () => {
      const dto = await service.getBusinessSubscription(admin, BIZ);

      expect(dto.plan_code).toBe('pro');
      // Un admin de plataforma no es miembro de ningún negocio: preguntarle
      // por su rol sería preguntar sobre una fila que no existe.
      expect(repository.roleOf).not.toHaveBeenCalled();
    });

    it('un negocio inexistente es 404, y no se lee su plan', async () => {
      repository.businessExists.mockResolvedValue(false);

      await expect(
        service.getBusinessSubscription(admin, MISSING_BIZ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.findBusinessSubscription).not.toHaveBeenCalled();
    });

    it('sin fila viva, el negocio se lee free: el mismo plan_code que da business_plan_of', async () => {
      repository.findBusinessSubscription.mockResolvedValue(null);

      const dto = await service.getBusinessSubscription(owner, BIZ);

      expect(dto.plan_code).toBe('free');
      expect(dto.since).toBeNull();
      // Y los límites y las features son los de la fila `free` del catálogo,
      // no los de una constante de TypeScript.
      expect(dto.limits).toEqual({ max_locations: 1, max_members: 2 });
      expect(dto.features).toEqual(['staff_access']);
      expect(repository.findPlan).toHaveBeenCalledWith('free');
    });

    it('los límites y las features vienen del catálogo, no de una constante', async () => {
      // Un plan con números que NO son los del §4.5: la respuesta tiene que
      // llevar los de la fila. Si la API tuviera su propia copia de los
      // topes, esto contestaría los de la copia — y el motor cortaría con los
      // de la tabla, que es la mentira que el catálogo vino a quitar.
      repository.findBusinessSubscription.mockResolvedValue(
        subscriptionEntry({
          plan_code: 'pro',
          plan: { ...proPlan, max_locations: 7, max_members: 9 },
        }),
      );

      const dto = await service.getBusinessSubscription(owner, BIZ);

      expect(dto.limits).toEqual({ max_locations: 7, max_members: 9 });
    });
  });

  // ────────────────────────── asignar el plan ──────────────────────────

  describe('asignar el plan', () => {
    it('el dueño del negocio no puede asignar el plan', async () => {
      await expect(
        service.assign(owner, BIZ, { plan_code: 'pro' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.assign(owner, BIZ, { plan_code: 'pro' }),
      ).rejects.toThrow('Asignar el plan de un negocio es de la plataforma.');
      expect(repository.updateLiveSubscription).not.toHaveBeenCalled();
      expect(repository.insertBusinessSubscription).not.toHaveBeenCalled();
    });

    it('un plan que no existe en el catálogo es 422, y no escribe nada', async () => {
      repository.findPlan.mockResolvedValue(null);

      await expect(
        service.assign(admin, BIZ, { plan_code: 'pro' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      await expect(
        service.assign(admin, BIZ, { plan_code: 'pro' }),
      ).rejects.toThrow('Ese plan no existe.');
      expect(repository.updateLiveSubscription).not.toHaveBeenCalled();
      expect(repository.insertBusinessSubscription).not.toHaveBeenCalled();
    });

    it('un plan retirado de la oferta es 422 también', async () => {
      // `is_active = false` retira el plan de la oferta sin borrarlo del
      // catálogo: existe, pero no se ofrece. El mensaje es el mismo porque la
      // respuesta que el panel necesita es la misma.
      repository.findPlan.mockResolvedValue(retiredPlan);

      await expect(
        service.assign(admin, BIZ, { plan_code: 'pro' }),
      ).rejects.toThrow('Ese plan no existe.');
      expect(repository.insertBusinessSubscription).not.toHaveBeenCalled();
    });

    it('un negocio inexistente es 404, y no se escribe nada', async () => {
      repository.businessExists.mockResolvedValue(false);

      await expect(
        service.assign(admin, MISSING_BIZ, { plan_code: 'pro' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.insertBusinessSubscription).not.toHaveBeenCalled();
    });

    it('un negocio SIN fila viva recibe una INSERCIÓN, y la respuesta es la del catálogo', async () => {
      repository.updateLiveSubscription.mockResolvedValue(null);

      const dto = await service.assign(admin, BIZ, { plan_code: 'pro' });

      expect(repository.insertBusinessSubscription).toHaveBeenCalledWith(
        BIZ,
        'pro',
      );
      expect(dto.plan_code).toBe('pro');
      expect(dto.limits).toEqual({ max_locations: 5, max_members: 20 });
      expect(dto.features).toEqual(['staff_access', 'payments']);
      expect(BusinessSubscriptionSchema.parse(dto)).toEqual(dto);
    });

    it('un negocio CON fila viva recibe una ACTUALIZACIÓN, y no queda una segunda fila viva', async () => {
      repository.updateLiveSubscription.mockResolvedValue({
        id: 'sub-1',
        business_id: BIZ,
        user_id: null,
        plan_code: 'pro',
        started_at: SINCE,
        cancelled_at: null,
        deleted_at: null,
        created_at: SINCE,
        updated_at: SINCE,
      });

      const dto = await service.assign(admin, BIZ, { plan_code: 'pro' });

      expect(repository.updateLiveSubscription).toHaveBeenCalledWith(
        BIZ,
        'pro',
      );
      // Y NO se inserta: dos filas vivas del mismo negocio son dos respuestas a
      // «qué plan tiene este negocio».
      expect(repository.insertBusinessSubscription).not.toHaveBeenCalled();
      expect(dto.plan_code).toBe('pro');
      // La fecha es la de la fila: cambiar de plan no reinicia la suscripción.
      expect(dto.since).toBe(SINCE.toISOString());
    });

    it('el cambio queda en el log con el evento, el de antes y el de después', async () => {
      repository.findBusinessSubscription.mockResolvedValue(
        subscriptionEntry({ plan_code: 'free', plan: freePlan }),
      );

      await service.assign(admin, BIZ, { plan_code: 'pro' });

      expect(logs).toContainEqual({
        event: 'business_plan_changed',
        businessId: BIZ,
        from: 'free',
        to: 'pro',
        actorId: ADMIN_USER,
      });
    });

    it('un alta se registra desde free: la ausencia de fila es el plan free', async () => {
      repository.findBusinessSubscription.mockResolvedValue(null);

      await service.assign(admin, BIZ, { plan_code: 'pro' });

      expect(logs).toContainEqual({
        event: 'business_plan_changed',
        businessId: BIZ,
        from: 'free',
        to: 'pro',
        actorId: ADMIN_USER,
      });
    });
  });
});
