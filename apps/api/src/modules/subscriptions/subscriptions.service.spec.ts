import {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DrizzleQueryError } from 'drizzle-orm';
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

/**
 * La fila viva de `subscriptions`, tal como la base la tiene.
 *
 * La escribe el REPOSITORIO —la base pone el `id` y las fechas—, y por eso el
 * doble no inventa un `id` que la base no pondría.
 */
function subscriptionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    business_id: BIZ,
    user_id: null,
    plan_code: 'pro',
    started_at: SINCE,
    cancelled_at: null,
    deleted_at: null,
    created_at: SINCE,
    updated_at: SINCE,
    ...overrides,
  };
}

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let repository: Record<string, ReturnType<typeof jest.fn>>;
  let logs: Record<string, unknown>[];

  /**
   * El handle de transacción, para poder afirmar que la lectura y la escritura
   * van con EL MISMO.
   *
   * No es un doble de la base: es una marca. Lo que se afirma es que las dos
   * mitades de la asignación viajan por la transacción, y eso se ve en que
   * reciben la misma marca.
   */
  const TX = { tx: true };

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
      /**
       * La transacción: corre el callback con SU handle. El doble no sabe
       * nada de rollback —eso lo sabe la base—, así que un error del callback
       * sale tal cual, que es lo que el servicio necesita para reintentar.
       */
      transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(TX),
      ),
      /**
       * La fila VIVA, leída para escribir encima. Por defecto NO hay fila: un
       * negocio sin suscripción es el caso de arranque, y el test que necesita
       * una fila viva la pone.
       */
      findLiveSubscriptionForUpdate: jest.fn(async () => null),
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
        TX,
        BIZ,
        'pro',
      );
      expect(dto.plan_code).toBe('pro');
      expect(dto.limits).toEqual({ max_locations: 5, max_members: 20 });
      expect(dto.features).toEqual(['staff_access', 'payments']);
      expect(BusinessSubscriptionSchema.parse(dto)).toEqual(dto);
    });

    it('un negocio CON fila viva recibe una ACTUALIZACIÓN, y no queda una segunda fila viva', async () => {
      repository.findLiveSubscriptionForUpdate.mockResolvedValue(
        subscriptionRow({ plan_code: 'free' }),
      );
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
        TX,
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

    /**
     * LA CARRERA DE DOS ESCRITORES.
     *
     * El `23505` de la carrera llega ENVUELTO: Drizzle mete el error de
     * Postgres en un `DrizzleQueryError` que no copia el código, así que el
     * `code` y el `constraint_name` están un nivel más abajo, en el `cause`.
     *
     * Y esto no es un detalle de forma: una búsqueda que mirara sólo el error
     * de arriba NO ENCONTRARÍA NUNCA el `23505`, la carrera terminaría en un
     * 500 sin traducir, y el reintento —que es lo que el servicio promete— no
     * existiría. El test de abajo falla si el `cause` deja de mirarse.
     */
    it('dos escritores a la vez: el segundo reintenta y su plan queda aplicado', async () => {
      const postgresError = Object.assign(
        new Error(
          'duplicate key value violates unique constraint "subscriptions_live_business_key"',
        ),
        {
          code: '23505',
          constraint_name: 'subscriptions_live_business_key',
        },
      );

      repository.insertBusinessSubscription.mockRejectedValue(
        new DrizzleQueryError(
          'insert into "subscriptions" ("business_id", "plan_code") values ($1, $2)',
          [],
          postgresError,
        ),
      );
      repository.findLiveSubscriptionForUpdate
        // La primera vuelta no ve fila: los dos escritores vieron que no la
        // había.
        .mockResolvedValueOnce(null)
        // El reintento sí la ve: el otro escritor ya la insertó.
        .mockResolvedValueOnce(subscriptionRow({ plan_code: 'free' }));
      repository.updateLiveSubscription
        // El primer `UPDATE` no encuentra fila: los dos escritores vieron que
        // no la había.
        .mockResolvedValueOnce(null)
        // El reintento sí la encuentra: el otro escritor ya la insertó.
        .mockResolvedValueOnce(subscriptionRow());

      const dto = await service.assign(admin, BIZ, { plan_code: 'pro' });

      expect(repository.updateLiveSubscription).toHaveBeenCalledTimes(2);
      // Y el reintento es la TRANSACCIÓN ENTERA: se vuelve a leer la fila y a
      // escribir encima, porque la fila del otro escritor ya está.
      expect(repository.transaction).toHaveBeenCalledTimes(2);
      expect(dto.plan_code).toBe('pro');
    });

    /**
     * Y el `23505` DE OTRA COSA no se reintenta.
     *
     * Un `23505` de otra unicidad es un error de otra cosa: tragárselo —o
     * reintentarlo— sería estar mintiendo sobre lo que pasó. El nombre del
     * índice es lo que distingue los dos.
     */
    it('un 23505 de OTRA unicidad no se reintenta: sale tal cual', async () => {
      const postgresError = Object.assign(
        new Error('duplicate key value violates unique constraint "otra_cosa"'),
        { code: '23505', constraint_name: 'otra_cosa' },
      );

      repository.insertBusinessSubscription.mockRejectedValue(
        new DrizzleQueryError(
          'insert into "subscriptions" ...',
          [],
          postgresError,
        ),
      );

      // El error sale TAL CUAL: no se traga, no se reintenta y no se
      // traduce. Lo que no se sabe, esta capa no lo inventa.
      await expect(
        service.assign(admin, BIZ, { plan_code: 'pro' }),
      ).rejects.toThrow(DrizzleQueryError);
      // Y NO se reintenta: el `UPDATE` se llamó una vez, la de antes del
      // `INSERT`.
      expect(repository.updateLiveSubscription).toHaveBeenCalledTimes(1);
    });

    it('el cambio queda en el log con el evento, el de antes y el de después', async () => {
      repository.findLiveSubscriptionForUpdate.mockResolvedValue(
        subscriptionRow({ plan_code: 'free' }),
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
      repository.findLiveSubscriptionForUpdate.mockResolvedValue(null);

      await service.assign(admin, BIZ, { plan_code: 'pro' });

      expect(logs).toContainEqual({
        event: 'business_plan_changed',
        businessId: BIZ,
        from: 'free',
        to: 'pro',
        actorId: ADMIN_USER,
      });
    });

    /**
     * LA ASIGNACIÓN QUE NO CAMBIA NADA.
     *
     * La fila ya dice ese plan: escribirla sólo movería el `updated_at` del
     * trigger —un «cambió» que no pasó— y el log registraría un cambio con el
     * plan de antes y el de después IGUALES. No se escribe y no se registra.
     */
    it('asignar el plan que el negocio ya tiene no escribe ni se registra', async () => {
      repository.findLiveSubscriptionForUpdate.mockResolvedValue(
        subscriptionRow({ plan_code: 'pro' }),
      );

      const dto = await service.assign(admin, BIZ, { plan_code: 'pro' });

      expect(repository.updateLiveSubscription).not.toHaveBeenCalled();
      expect(repository.insertBusinessSubscription).not.toHaveBeenCalled();
      expect(logs).not.toContainEqual(
        expect.objectContaining({ event: 'business_plan_changed' }),
      );
      // Y la respuesta es la suscripción que el negocio ya tenía: el mismo
      // plan, la misma fecha y los límites del catálogo.
      expect(dto.plan_code).toBe('pro');
      expect(dto.since).toBe(SINCE.toISOString());
      expect(dto.limits).toEqual({ max_locations: 5, max_members: 20 });
      expect(BusinessSubscriptionSchema.parse(dto)).toEqual(dto);
    });

    /**
     * Y el caso del NEGOCIO SIN FILA al que se le asigna el plan que ya tenía
     * de facto.
     *
     * Sin fila, el negocio se lee `free` —es el `coalesce` de la base—, así
     * que asignarle el `free` no cambia lo que tiene: no se crea la fila, no
     * se registra el cambio y la respuesta es la que ya se leía.
     */
    it('asignar el free a un negocio sin fila tampoco escribe', async () => {
      repository.findLiveSubscriptionForUpdate.mockResolvedValue(null);

      const dto = await service.assign(admin, BIZ, { plan_code: 'free' });

      expect(repository.updateLiveSubscription).not.toHaveBeenCalled();
      expect(repository.insertBusinessSubscription).not.toHaveBeenCalled();
      expect(logs).not.toContainEqual(
        expect.objectContaining({ event: 'business_plan_changed' }),
      );
      expect(dto.plan_code).toBe('free');
      expect(dto.since).toBeNull();
      expect(dto.limits).toEqual({ max_locations: 1, max_members: 2 });
    });

    /**
     * LA LECTURA Y LA ESCRITURA, EN UNA TRANSACCIÓN.
     *
     * El `from` del log tiene que ser el valor que la escritura SOBRESCRIBIÓ:
     * leer en una consulta y escribir en otra deja una ventana en la que otro
     * escritor cambia el plan, y el log acaba diciendo `from: free` para una
     * fila que estaba en `pro`.
     */
    it('la fila viva se lee y se escribe en la MISMA transacción', async () => {
      repository.findLiveSubscriptionForUpdate.mockResolvedValue(
        subscriptionRow({ plan_code: 'free' }),
      );

      await service.assign(admin, BIZ, { plan_code: 'pro' });

      expect(repository.transaction).toHaveBeenCalledTimes(1);
      // Las dos mitades viajan con el MISMO handle: la que se leyó es la que
      // se escribe.
      expect(repository.findLiveSubscriptionForUpdate).toHaveBeenCalledWith(
        TX,
        BIZ,
      );
      expect(repository.updateLiveSubscription).toHaveBeenCalledWith(
        TX,
        BIZ,
        'pro',
      );
    });

    it('el `from` del log es el valor que la fila tenía', async () => {
      repository.findLiveSubscriptionForUpdate.mockResolvedValue(
        subscriptionRow({ plan_code: 'pro' }),
      );
      repository.updateLiveSubscription.mockResolvedValue(
        subscriptionRow({ plan_code: 'pro_plus' }),
      );

      await service.assign(admin, BIZ, { plan_code: 'pro_plus' });

      expect(logs).toContainEqual({
        event: 'business_plan_changed',
        businessId: BIZ,
        from: 'pro',
        to: 'pro_plus',
        actorId: ADMIN_USER,
      });
    });

    /**
     * EL REINTENTO QUE TAMPOCO PUEDE ESCRIBIR.
     *
     * La carrera de dos escritores se reintenta; si el reintento tampoco
     * puede aplicar el plan, el `DrizzleQueryError` crudo salía como un 500
     * sin traducir: un error que el panel no sabe pintar y que no dice qué
     * pasó. Ahora es un 500 de avería de configuración, con su mensaje.
     */
    it('si el reintento tampoco puede escribir, el error sale traducido', async () => {
      const postgresError = Object.assign(
        new Error(
          'duplicate key value violates unique constraint "subscriptions_live_business_key"',
        ),
        {
          code: '23505',
          constraint_name: 'subscriptions_live_business_key',
        },
      );

      repository.insertBusinessSubscription.mockRejectedValue(
        new DrizzleQueryError(
          'insert into "subscriptions" ("business_id", "plan_code") values ($1, $2)',
          [],
          postgresError,
        ),
      );

      const error = await service
        .assign(admin, BIZ, { plan_code: 'pro' })
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(InternalServerErrorException);
      const message = (error as InternalServerErrorException).message;
      expect(message).toContain('No se pudo guardar el plan del negocio');
      // Y no dice «subí de plan»: esto no es una negativa del plan.
      expect(message).not.toContain('subí de plan');
      // El operador ve el fallo con su código de Postgres: el `code` vive en
      // el `cause`, como en la búsqueda del `23505`.
      expect(logs).toContainEqual({
        event: 'business_plan_write_failed',
        businessId: BIZ,
        errorType: 'Error',
        errorCode: '23505',
      });
    });
  });
});
