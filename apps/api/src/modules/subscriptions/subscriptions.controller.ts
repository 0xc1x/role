import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  UpdateBusinessSubscriptionSchema,
  type BusinessSubscriptionDto,
  type SubscriptionPlanDto,
  type UpdateBusinessSubscriptionDto,
} from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SubscriptionsService } from './subscriptions.service';

/**
 * EL CATÁLOGO Y LA SUSCRIPCIÓN DEL NEGOCIO.
 *
 * Tres rutas, y cada una con una puerta distinta:
 *
 *  - `GET /plans` — el catálogo, para cualquier usuario autenticado. Es la
 *    oferta: los planes que están en venta, no los que quedaron retirados.
 *  - `GET /businesses/:businessId/subscription` — el plan de UN negocio, para
 *    su dueño o su gerente, o para la plataforma.
 *  - `PATCH /businesses/:businessId/subscription` — la plataforma asigna el
 *    plan. Y sólo la plataforma.
 *
 * ─── POR QUÉ NO HAY `@Roles` EN NINGUNA ───────────────────────────────────────
 *
 * Porque el guard de rol de Nest mide `profiles.role`, que es el `app_role` de
 * la cuenta —negocio o consumidor— y no lleva TTL. Lo que decide aquí es el
 * rol DE NEGOCIO —dueño o gerente—, que es un hecho de `business_members` y no
 * de `profiles`, y ese lo contesta `membershipRole`, en el servicio. El
 * `AuthGuard` global sí corre en las tres: sin token no hay ni catálogo.
 *
 * ─── Y POR QUÉ EL PREFIJO GLOBAL NO ESTÁ EN EL CONTROLADOR ──────────────────
 *
 * `api/v1` lo pone `main.ts`, y las tres rutas no comparten prefijo: una vive
 * en la raíz de la API y las otras dos bajo `businesses/:businessId`. Un
 * `@Controller()` sin prefijo con las rutas completas en cada decorador es lo
 * que deja el tabla de rutas legible.
 */
@ApiTags('Subscriptions')
@ApiBearerAuth('bearer')
@Controller()
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  /**
   * `GET /plans` — el catálogo de planes.
   *
   * Cualquier usuario autenticado: el catálogo no es de nadie, es la oferta. Y
   * sólo los planes EN OFERTA (`is_active = true`): un plan retirado de la
   * oferta no se ofrece, y el motor lo sigue aplicando a quien ya lo tenía.
   */
  @Get('plans')
  @ApiOperation({
    summary:
      'The plans on offer, with their limits and the features they include.',
  })
  @ApiOkResponse({ description: 'The active plans of the catalogue' })
  listPlans(): Promise<SubscriptionPlanDto[]> {
    return this.subscriptionsService.listPlans();
  }

  /**
   * `GET /businesses/:businessId/subscription` — el plan del negocio.
   *
   * El dueño o su gerente, o un admin de plataforma. Cualquier otro caso es un
   * 403, y el 403 no dice NADA del negocio: el plan de un negocio es de su
   * dueño, y quien no administra el negocio no administra su plan.
   */
  @Get('businesses/:businessId/subscription')
  @ApiOperation({
    summary:
      'The plan of a business: its code, its limits and its features. The owner, its manager or the platform.',
  })
  @ApiOkResponse({ description: 'The plan the business has right now' })
  @ApiForbiddenResponse({
    description:
      'The caller is neither the owner nor a manager of the business',
  })
  @ApiNotFoundResponse({ description: 'No such business' })
  getSubscription(
    @CurrentUser() user: AuthUser,
    @Param('businessId', ParseUUIDPipe) businessId: string,
  ): Promise<BusinessSubscriptionDto> {
    return this.subscriptionsService.getBusinessSubscription(user, businessId);
  }

  /**
   * `PATCH /businesses/:businessId/subscription` — la plataforma asigna el plan.
   *
   * El cuerpo lleva SÓLO el código del plan: los límites y las features salen
   * del catálogo, y mandarlos en el cuerpo sería dejar que el cliente se
   * escribiera el número que el motor aplica. `.strict()` convierte esa puerta
   * de atrás en un 400 en vez de en un 200 que finge haber guardado lo que el
   * cliente creía.
   *
   * Y el `business_id` tampoco está: lo trae la ruta, y un cuerpo que pudiera
   * contradecirla cambiaría el plan de otro negocio.
   */
  @Patch('businesses/:businessId/subscription')
  @ApiOperation({
    summary:
      'Assign the plan of a business. Platform only: the limits and the features come from the catalogue, never from the body.',
  })
  @ApiOkResponse({ description: 'The plan the business has after the change' })
  @ApiForbiddenResponse({
    description: 'The caller is not the platform',
  })
  @ApiNotFoundResponse({ description: 'No such business' })
  @ApiUnprocessableEntityResponse({
    description: 'That plan is not in the catalogue, or it is not on offer',
  })
  assign(
    @CurrentUser() user: AuthUser,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body(new ZodValidationPipe(UpdateBusinessSubscriptionSchema))
    body: UpdateBusinessSubscriptionDto,
  ): Promise<BusinessSubscriptionDto> {
    return this.subscriptionsService.assign(user, businessId, body);
  }
}
