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
import type { AuthUser } from '../../auth/auth.types';
import { SubscriptionsMapper } from './subscriptions.mapper';
import {
  SubscriptionsRepository,
  type SubscriptionRow,
} from './subscriptions.repository';

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

    // El plan DE ANTES, para el log. Se lee antes de escribir, porque después
    // de escribir la fila ya dice el plan nuevo.
    const current = await this.repository.findBusinessSubscription(businessId);
    const from: BusinessPlanCode = current?.plan_code ?? 'free';

    const row = await this.writePlan(businessId, body.plan_code);

    this.logger.log({
      event: 'business_plan_changed',
      businessId,
      from,
      to: body.plan_code,
      actorId: user.id,
    });

    return SubscriptionsMapper.toSubscriptionDto(
      businessId,
      body.plan_code,
      row.started_at,
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
   * y sólo en ese caso— el segundo vuelve a hacer el `UPDATE` y su plan
   * termina aplicado. La última escritura gana, que es lo que se espera de
   * una asignación a mano.
   */
  private async writePlan(
    businessId: string,
    planCode: BusinessPlanCode,
  ): Promise<SubscriptionRow> {
    const updated = await this.repository.updateLiveSubscription(
      businessId,
      planCode,
    );
    if (updated) return updated;

    try {
      return await this.repository.insertBusinessSubscription(
        businessId,
        planCode,
      );
    } catch (error) {
      if (!this.isLiveBusinessKeyViolation(error)) throw error;

      const retried = await this.repository.updateLiveSubscription(
        businessId,
        planCode,
      );
      if (!retried) throw error;
      return retried;
    }
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
   * Es la misma búsqueda que hace `BusinessesService.mapBusinessWriteError`
   * (`businesses.service.ts:482-507`), y se copia en vez de inventar una
   * tercera forma: tres búsquedas del mismo código de Postgres son tres
   * lugares donde puede estar la copia que no encuentra nada.
   */
  private isLiveBusinessKeyViolation(error: unknown): boolean {
    const candidates = [
      error,
      (error as { cause?: unknown } | null)?.cause,
    ] as unknown[];

    for (const candidate of candidates) {
      const postgresError = candidate as {
        code?: string;
        constraint_name?: string;
      } | null;
      if (postgresError?.code !== PG_UNIQUE_VIOLATION) continue;
      if (postgresError.constraint_name !== LIVE_BUSINESS_KEY) continue;
      return true;
    }
    return false;
  }
}
