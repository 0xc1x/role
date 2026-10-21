import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  BusinessPlanCode,
  BusinessSubscriptionDto,
  SubscriptionPlanDto,
  UpdateBusinessSubscriptionDto,
} from '@0xc1x/role-commons';
import { safeErrorFields } from '@0xc1x/role-commons';
import { findPostgresError } from '../../common/utils/postgres-error';
import type { AuthUser } from '../../auth/auth.types';
import { SubscriptionsMapper } from './subscriptions.mapper';
import { SubscriptionsRepository } from './subscriptions.repository';

/**
 * LO QUE LA ASIGNACIÓN DEJÓ.
 *
 * `changed` es la respuesta a «¿hubo algo que guardar?»: una asignación que no
 * cambia el plan no escribe y no se registra, así que la respuesta es la
 * suscripción que el negocio ya tenía.
 */
type PlanAssignment = {
  /** El plan que tenía el negocio ANTES de esta asignación. */
  from: BusinessPlanCode;
  /** El plan que tiene el negocio AHORA. */
  planCode: BusinessPlanCode;
  /** Desde cuándo es la suscripción: la fecha de la fila que la sostiene. */
  startedAt: Date | null;
  /** ¿Se escribió algo? */
  changed: boolean;
};

/**
 * El código de Postgres de una unicidad violada.
 *
 * La API lo traduce en vez de reenviarlo: un `23505` crudo es un error de
 * servidor para el panel, y el panel no sabe pintarlo.
 */
const PG_UNIQUE_VIOLATION = '23505';

/** El índice que garantiza UNA fila viva por negocio. */
const LIVE_BUSINESS_KEY = 'subscriptions_live_business_key';

/**
 * EL CATÁLOGO Y LA SUSCRIPCIÓN DEL NEGOCIO.
 *
 * ─── QUÉ HACE ESTE MÓDULO Y QUÉ NO ───────────────────────────────────────────
 *
 * Hace tres cosas: leer el catálogo, leer el plan de un negocio y ASIGNAR un
 * plan a un negocio. No cobra, no renueva y no factura: no hay pasarela ni
 * cobro automático en esta etapa, y el plan se asigna a mano.
 *
 * ─── POR QUÉ LOS LÍMITES Y LAS FEATURES VIENEN DEL CATÁLOGO ─────────────────
 *
 * Porque la suscripción dice QUÉ plan tiene el negocio y el catálogo dice QUÉ
 * incluye ese plan. Si los límites vivieran en la suscripción, habría dos
 * sitios con el mismo número —la fila y el catálogo— y entre dos números no
 * hay nada que los ate: el dueño lee «2 miembros» en el panel y el motor corta
 * en 3. Por eso la respuesta se arma con la fila del catálogo, y por eso un
 * negocio SIN fila se lee igual: `free`, con los límites de la fila `free`.
 *
 * ─── Y POR QUÉ EL PLAN LO ASIGNA LA PLATAFORMA Y NO EL DUEÑO ─────────────────
 *
 * Porque el plan es lo que se VENDE, y vender es un acto de la plataforma. El
 * dueño administra su negocio —sus sucursales, su equipo, sus pedidos— pero no
 * decide en qué plan está: si lo decidiera, el tope sería una sugerencia y
 * el motor no podría cortar nada (§5.4: el plan bloquea crecer, nunca operar).
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(private readonly repository: SubscriptionsRepository) {}

  // ─────────────────────────────── el catálogo ───────────────────────────────

  /**
   * `GET /plans`: los planes que están EN LA OFERTA.
   *
   * Los retirados de la oferta (`is_active = false`) no salen: no se ofrecen,
   * y una lista que los ofreciera haría que el panel mostrara un plan que
   * nadie puede comprar. El catálogo COMPLETO lo sigue leyendo el motor, que
   * aplica los topes de quien ya los tiene aunque el plan se retire.
   */
  async listPlans(): Promise<SubscriptionPlanDto[]> {
    const plans = await this.repository.listActivePlans();
    return plans.map((plan) => SubscriptionsMapper.toPlanDto(plan));
  }

  // ────────────────────────── ver el plan del negocio ─────────────────────────

  /**
   * `GET /businesses/:businessId/subscription`: el plan del negocio.
   *
   * ─── LAS TRES PUERTAS, Y EN ESTE ORDEN ──────────────────────────────────────
   *
   * La existencia del negocio va PRIMERO, y es una decisión: la existencia de
   * un negocio no es un secreto en esta API —hay una ruta pública que la
   * responde— y el panel ya tiene la lista. Lo que sí es secreto es el plan,
   * y por eso la puerta de la membresía va después y es la que responde.
   *
   * Y la puerta es la del NEGOCIO, no la de la plataforma: el dueño y su
   * gerente ven el plan de su negocio, y un admin de plataforma lo ve porque
   * supervisa la plataforma entera. Un empleado no: el plan no es suyo, y el
   * 403 lo dice sin decir qué tiene el negocio.
   */
  async getBusinessSubscription(
    user: AuthUser,
    businessId: string,
  ): Promise<BusinessSubscriptionDto> {
    await this.requireBusiness(businessId);
    await this.requirePlanViewer(user, businessId);

    const subscription =
      await this.repository.findBusinessSubscription(businessId);

    if (!subscription) {
      // SIN FILA VIVA, EL NEGOCIO SE LEE `free`: es el mismo `coalesce` que
      // hace `public.business_plan_of`, y la misma respuesta que el motor
      // está aplicando mientras tanto.
      const free = await this.repository.findPlan('free');
      if (!free) {
        throw new InternalServerErrorException(
          'El catálogo no tiene el plan `free`: el motor no puede resolver el plan de este negocio.',
        );
      }
      return SubscriptionsMapper.toSubscriptionDto(
        businessId,
        'free',
        null,
        free,
      );
    }

    if (!subscription.plan) {
      // Una suscripción viva con un plan que NO está en el catálogo: el motor
      // se niega en voz alta en este estado, y esta API no puede inventar los
      // límites de un plan que no conoce. Un 500 dice «no lo sé»; un `free`
      // con topes inventados sería una mentira.
      throw new InternalServerErrorException(
        `El catálogo no tiene el plan \`${subscription.plan_code}\` de este negocio.`,
      );
    }

    return SubscriptionsMapper.toSubscriptionDto(
      businessId,
      subscription.plan_code,
      subscription.started_at,
      subscription.plan,
    );
  }

  // ─────────────────────────── asignar el plan ───────────────────────────────

  /**
   * `PATCH /businesses/:businessId/subscription`: la plataforma asigna el plan.
   *
   * ─── LA PUERTA ES DE LA PLATAFORMA Y NO DE LA MEMBRESÍA ─────────────────────
   *
   * Porque asignar el plan es un acto de la PLATAFORMA, no una operación del
   * negocio: un `app_role = 'admin'` no es miembro de ningún negocio —no tiene
   * fila que buscar— y la puerta es la de `app_role`, como la de
   * `POST /businesses/:id/ownership/restore`.
   *
   * ─── Y LA ESCRITURA ES SOBRE LA FILA VIVA, O SOBRE NINGUNA ──────────────────
   *
   * Un negocio tiene como mucho una fila viva —lo garantiza el índice único
   * parcial `subscriptions_live_business_key`—, así que la operación es
   *(actualizar la fila viva) o (insertar una nueva). La fila cancelada o
   * archivada se queda para decir qué hubo: no se toca, y no se la cuenta.
   *
   * ─── Y LA ASIGNACIÓN QUE NO CAMBIA NADA NO ESCRIBE ──────────────────────────
   *
   * Porque la fila ya dice ese plan: no hay nada que guardar y nada que
   * cambió. Escribirla sólo movería el `updated_at` del trigger —un «cambió»
   * que no pasó— y el log registraría un `business_plan_changed` con el plan
   * de antes y el de después IGUALES. La respuesta es la suscripción que el
   * negocio ya tenía.
   *
   * ─── Y EL `422` DEL PLAN QUE NO EXISTE ──────────────────────────────────────
   *
   * Un `plan_code` que no está en el catálogo —o que está retirado de la
   * oferta— es un 422 con un motivo, no un 400 de forma: el cuerpo está bien
   * escrito, lo que no existe es el plan. Y el mismo 422 para los dos casos,
   * porque la respuesta que el panel necesita es la misma: «ese plan no se
   * puede asignar».
   *
   * ─── Y POR QUÉ AQUÍ LA PLATAFORMA VA ANTES QUE LA EXISTENCIA ────────────────
   *
   * Porque esa puerta no depende del negocio —es del que llama—, así que
   * responder «ese negocio no existe» a alguien que no tiene derecho a
   * asignar planes le diría más de lo que le corresponde. En el `GET` el orden
   * es al revés porque allí la puerta SÍ depende del negocio, y la existencia
   * de un negocio no es un secreto en esta API.
   */
  async assign(
    user: AuthUser,
    businessId: string,
    body: UpdateBusinessSubscriptionDto,
  ): Promise<BusinessSubscriptionDto> {
    if (user.role !== 'admin') {
      throw new ForbiddenException(
        'Asignar el plan de un negocio es de la plataforma.',
      );
    }

    await this.requireBusiness(businessId);

    const plan = await this.repository.findPlan(body.plan_code);
    if (!plan || !plan.is_active) {
      throw new UnprocessableEntityException('Ese plan no existe.');
    }

    // La LECTURA de la fila viva y la ESCRITURA del plan van en UNA
    // transacción, con la fila leída `for update`: el `from` del log tiene que
    // ser el valor que la escritura sobrescribió, y no el que había un rato
    // antes.
    const applied = await this.writePlan(businessId, body.plan_code);

    // Una asignación que NO cambia nada no se registra: el log dice lo que
    // pasó, y no pasó nada.
    if (applied.changed) {
      this.logger.log({
        event: 'business_plan_changed',
        businessId,
        from: applied.from,
        to: body.plan_code,
        actorId: user.id,
      });
    }

    return SubscriptionsMapper.toSubscriptionDto(
      businessId,
      applied.planCode,
      applied.startedAt,
      plan,
    );
  }

  // ─────────────────────────────── las puertas ───────────────────────────────

  /**
   * El negocio existe, o no hay nada que responder.
   */
  private async requireBusiness(businessId: string): Promise<void> {
    if (!(await this.repository.businessExists(businessId))) {
      throw new NotFoundException('Negocio no encontrado');
    }
  }

  /**
   * El dueño o su gerente, o la plataforma.
   *
   * El predicado es el de `apps/api/src/database/business-membership.ts` —la
   * membresía VIVA, con la sesión dentro de la promesa del §5.2— y esta capa
   * sólo dice qué exige sobre ese hecho: dueño o gerente, y nada más.
   */
  private async requirePlanViewer(
    user: AuthUser,
    businessId: string,
  ): Promise<void> {
    if (user.role === 'admin') return;

    const role = await this.repository.roleOf(businessId, user.id);
    if (role !== 'owner' && role !== 'manager') {
      throw new ForbiddenException(
        'Ver el plan del negocio es del dueño o su gerente.',
      );
    }
  }

  // ─────────────────────────────── la escritura ──────────────────────────────

  /**
   * Cambia el plan de la fila viva, o crea la fila si no hay ninguna.
   *
   * ─── POR QUÉ EL `UPDATE` VA PRIMERO ─────────────────────────────────────────
   *
   * Porque el `UPDATE` con el predicado de la fila viva es el que sabe si la
   * hay: si no la hay, no actualiza nada. Al revés —insertar y, si choca,
   * actualizar— el `23505` del índice único sería el camino normal y la
   * excepción, y una excepción que es el camino normal no es una excepción.
   *
   * ─── Y EL `23505` QUE SÍ SE DA ──────────────────────────────────────────────
   *
   * Dos escritores simultáneos: los dos ven que no hay fila y los dos
   * insertan, y el segundo choca con el índice único parcial. En ese caso —
   * y sólo en ese caso— la transacción entera se corre OTRA VEZ, y su plan
   * termina aplicado. La última escritura gana, que es lo que se espera de
   * una asignación a mano.
   *
   * ─── Y POR QUÉ EL REINTENTO ESTÁ FUERA DE LA TRANSACCIÓN ────────────────────
   *
   * Porque una transacción que se cayó no se reintenta por dentro: se vuelve
   * a abrir. Y porque el reintento tiene que ser la TRANSACCIÓN ENTERA —leer
   * la fila y escribir encima— y no sólo la escritura: la fila que el otro
   * escritor metió ya está, así que el `UPDATE` la encuentra y la cambia.
   *
   * ─── Y POR QUÉ LOS DOS INTENTOS CONTESTAN LO MISMO ──────────────────────────
   *
   * Porque un fallo de la escritura es un fallo de la escritura: el primer
   * intento y el reintento son la misma avería y se contestan con la misma
   * respuesta y con la misma línea de log. Si el primero subiera crudo, el
   * operador vería un `unhandled_exception` —sólo `errorType` y `errorCode`—
   * en un camino y un `http_exception` con su mensaje en el otro, sin poder
   * saber que son lo mismo.
   */
  private async writePlan(
    businessId: string,
    planCode: BusinessPlanCode,
  ): Promise<PlanAssignment> {
    try {
      return await this.applyPlan(businessId, planCode);
    } catch (error) {
      if (!this.isLiveBusinessKeyViolation(error)) {
        throw this.mapSubscriptionWriteError(businessId, error);
      }

      try {
        return await this.applyPlan(businessId, planCode);
      } catch (retryError) {
        throw this.mapSubscriptionWriteError(businessId, error, retryError);
      }
    }
  }

  /**
   * LA LECTURA Y LA ESCRITURA, EN UNA TRANSACCIÓN.
   *
   * ─── POR QUÉ VAN JUNTAS ─────────────────────────────────────────────────────
   *
   * Porque el `from` del log tiene que ser el valor que la escritura
   * SOBRESCRIBIÓ: leer la fila en una consulta y escribir en otra deja una
   * ventana en la que otro escritor cambia el plan, y el log acaba diciendo
   * `from: free` para una fila que en realidad estaba en `pro`.
   *
   * La fila se lee `for update`, así que el segundo escritor ESPERA a que el
   * primero suelte la fila y entonces lee el plan que el primero dejó. La
   * lectura y la escritura son una sola cosa, y el `from` es exactamente lo
   * que se sobrescribió.
   *
   * ─── Y LA ASIGNACIÓN QUE NO CAMBIA NADA ─────────────────────────────────────
   *
   * No escribe. La fila ya dice ese plan, y escribirla sólo movería el
   * `updated_at` del trigger: un «cambió» que no pasó. La respuesta es la
   * suscripción que el negocio ya tenía, con su `since` de la fila.
   */
  private async applyPlan(
    businessId: string,
    planCode: BusinessPlanCode,
  ): Promise<PlanAssignment> {
    return this.repository.transaction(async (tx) => {
      const current = await this.repository.findLiveSubscriptionForUpdate(
        tx,
        businessId,
      );
      const from: BusinessPlanCode = current?.plan_code ?? 'free';

      if (from === planCode) {
        return {
          from,
          planCode,
          startedAt: current?.started_at ?? null,
          changed: false,
        };
      }

      const updated = await this.repository.updateLiveSubscription(
        tx,
        businessId,
        planCode,
      );
      const row =
        updated ??
        (await this.repository.insertBusinessSubscription(
          tx,
          businessId,
          planCode,
        ));

      return {
        from,
        planCode,
        startedAt: row.started_at,
        changed: true,
      };
    });
  }

  /**
   * LA ESCRITURA QUE NO SE PUDO APLICAR.
   *
   * ─── POR QUÉ NO SALE EL ERROR CRUDO ────────────────────────────────────────
   *
   * Porque un `DrizzleQueryError` sin traducir es un 500 que no dice nada: el
   * panel no sabe pintarlo y el operador no sabe qué pasó. Esto es una
   * AVERÍA DE CONFIGURACIÓN y la casa la contesta con un 500 que dice lo que
   * pasó, como la puerta del catálogo roto del módulo de personal.
   *
   * El mensaje dice lo que esta capa SABE: la fila de la suscripción no se
   * pudo escribir. Lo que no sabe —y por eso no lo dice— es si la culpa es
   * del catálogo o de la fila: el catálogo se comprobó antes de la
   * transacción y estaba entero, así que lo que se rompió fue la escritura.
   *
   * ─── Y EL PRIMER INTENTO Y EL REINTENTO CONTESTAN IGUAL ─────────────────────
   *
   * Los dos caminos llaman a ESTE método: el primero que no es el `23505` de
   * la carrera y el del reintento que tampoco pudo aplicar el plan. Son la
   * misma avería y se contestan con la misma respuesta y con la misma línea
   * de log.
   *
   * ─── Y POR QUÉ EL ERROR DE ABAJO SE REGISTRA ────────────────────────────────
   *
   * Porque el mensaje de un 5xx lo redacta el filtro —de la respuesta y del
   * log—, así que sin esta línea el operador vería un `InternalServerError
   * Exception` sin saber si fue el `23505` de la carrera o la caída de la
   * conexión. La línea lleva el `errorType` y el `errorCode` del error de
   * Postgres —el `code` vive en el `cause`, como en `isLiveBusinessKeyViolation`—
   * y nunca su mensaje.
   */
  private mapSubscriptionWriteError(
    businessId: string,
    error: unknown,
    retryError?: unknown,
  ): InternalServerErrorException {
    const cause = findPostgresError(retryError) ?? findPostgresError(error);
    this.logger.error({
      event: 'business_plan_write_failed',
      businessId,
      ...safeErrorFields(cause ?? retryError ?? error),
    });

    return new InternalServerErrorException(
      'No se pudo guardar el plan del negocio: la fila de la suscripción no se pudo escribir. Es una avería de configuración, no una negativa del plan.',
    );
  }

  /**
   * ¿El `23505` es el del índice de la fila viva?
   *
   * Se mira el NOMBRE del índice y no sólo el código: un `23505` de otra
   * unicidad es un error de otra cosa, y tragárselo —o reintentarlo— sería
   * estar mintiendo sobre lo que pasó.
   *
   * ─── Y SE BUSCA EN EL ERROR **Y** EN SU `cause` ──────────────────────────────
   *
   * Porque Drizzle envuelve el error de Postgres en un `DrizzleQueryError` que
   * **no copia el código**: el `code` y el `constraint_name` viven un nivel
   * más abajo, en el `cause`. Un `error.code === '23505'` a secas no
   * encontraría NUNCA nada, y la carrera de dos writers terminaría en un 500
   * en vez de en el reintento —que es el comportamiento que este método
   * promete.
   *
   * La búsqueda es la del helper compartido
   * (`common/utils/postgres-error.ts`), que devuelve el nivel que trae el
   * `code` —el del `cause` cuando el error viene envuelto— y con él su
   * `constraint_name`.
   */
  private isLiveBusinessKeyViolation(error: unknown): boolean {
    const postgresError = findPostgresError(error);
    if (postgresError?.code !== PG_UNIQUE_VIOLATION) return false;
    return postgresError.constraint_name === LIVE_BUSINESS_KEY;
  }
}
