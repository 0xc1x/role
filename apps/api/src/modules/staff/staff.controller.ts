import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  CreateBusinessMemberSchema,
  RotateBusinessMemberPinSchema,
  UpdateBusinessMemberAliasSchema,
  UpdateBusinessMemberSchema,
} from '@0xc1x/role-commons';
import type {
  BusinessMemberDeliveryCardDto,
  BusinessMemberDto,
  CreateBusinessMemberDto,
  RotateBusinessMemberPinDto,
  UpdateBusinessMemberAliasDto,
  UpdateBusinessMemberAliasResponseDto,
  UpdateBusinessMemberDto,
} from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { StaffService } from './staff.service';

/**
 * The eight routes that live under `businesses/:businessId/staff`.
 *
 * **The ninth §8 route, `POST /staff/session`, is not here**: it seals rather
 * than administers, and it is the only one a `staff` may call. It lives in
 * `staff-session.controller.ts`, and its absence from this file is the fact, not
 * an omission — the other eight all refuse an employee at the door and this one
 * does not.
 *
 * ─── POR QUÉ NO HAY `@Roles` EN ESTAS RUTAS, Y POR QUÉ ESO NO ES UNA AUSENCIA ────
 *
 * El §8 dice que el guard de rol de negocio de Nest **se reemplaza** por
 * `can_manage_location`, y este controlador es donde eso se ve. Las ocho rutas de
 * abajo NO llevan `@Roles('business')`, y el motivo no es que la puerta se
 * haya olvidado: es que un `@Roles` mide `profiles.role`, que es `app_role` —la
 * cuenta es de negocio o de consumidor— y **no lleva TTL**. La promesa del §5.2
 * es otra: `session_ttl_hours` y `last_authenticated_at`, evaluados en
 * `business_member_session_valid`, que es lo que `can_manage_location` consulta
 * para no autorizar.
 *
 * Poner `@Roles('business')` sería dejar la frontera del §8 apoyada en el hecho
 * equivocado: un dueño cuya sesión venció administería igual que uno con la
 * sesión viva, porque las dos filas dicen `role = 'business'`. Y esta API escribe
 * con `service_role`, donde RLS no aplica, así que la promesa no la puede cumplir
 * nadie más que esta capa.
 *
 * ─── QUIÉN ABRE LA PUERTA, Y POR QUÉ NO ES UNA SEGUNDA COPIA ────────────────────
 *
 * La abre `StaffService.requireActor`, que ya existe de la Task 3 y que es la
 * misma pregunta que RLS hace: membresía viva, `status = 'active'`, un rol que
 * administra, y `business_member_session_state` —la función que
 * `can_manage_location` consulta para no autorizar— diciendo `reason: 'ok'`.
 * Ese es el motivo de que este controlador no escriba un guard propio: dos
 * fronteras para la misma pregunta son dos fronteras que pueden divergir, y el
 * §5.2 depende de que no lo hagan.
 *
 * El `AuthGuard` global sí corre —token válido y perfil existente—, así que
 * ninguna de estas rutas es anónima; lo que no corre es un chequeo de rol que
 * finja ser la autorización.
 *
 * ─── Y POR QUÉ LA LISTA TAMBIÉN PASA POR AHÍ ───────────────────────────────────
 *
 * `GET` está en el mismo grupo que las escrituras a propósito: `list()` llama a
 * `requireActor` igual, y un `staff` recibe su 403 por la misma puerta que un
 * `manager` fuera de su alcance. Y el filtro de la lista es de ALCANCE, no de
 * existencia: un `manager` no ve las filas que no administra ni para poder
 * devolverlas vacías, porque `alias` espeja `auth.users.email`.
 */
@ApiTags('Staff')
@ApiBearerAuth('bearer')
@Controller('businesses/:businessId/staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  /**
   * `GET /businesses/:businessId/staff` — the accesses of the business
   * (`deleted_at is null`).
   *
   * For a `manager` this is a LIST OF WHAT THEY MANAGE, not "every row, with
   * the buttons disabled": `alias` mirrors `auth.users.email`, so an access that
   * leaks into the list leaks a login address. The containment is applied by the
   * service to the rows that come back, not here.
   */
  @Get()
  @ApiOperation({
    summary:
      "List the business' team accesses. A manager sees only what their branches contain.",
  })
  @ApiOkResponse({ description: 'The accesses this caller administers' })
  @ApiForbiddenResponse({
    description:
      'No live membership, a paused one, or a session outside the §5.2 promise',
  })
  list(
    @CurrentUser() user: AuthUser,
    @Param('businessId', ParseUUIDPipe) businessId: string,
  ): Promise<BusinessMemberDto[]> {
    return this.staffService.list(user, businessId);
  }

  /**
   * `POST /businesses/:businessId/staff` — the `auth.users` + the membership, and
   * the PIN **once**.
   *
   * 201 because a resource is created here —two rows in two systems, compensated
   * by the service if the second one fails— and the response is the delivery
   * card, which is the only response in §8 that carries a PIN.
   *
   * ─── EL `422` DE `role: 'owner'` ES DEL SERVICIO, Y POR QUÉ ──────────────────
   *
   * `CreateBusinessMemberSchema` acepta el vocabulario entero a propósito
   * (`packages/commons/src/business/enums/business-member-role.ts` lo dice), así
   * que un `owner` en el cuerpo pasa la validación de forma y lo rechaza la
   * regla de producto con un **422** y un motivo: el dueño es quien creó el
   * negocio. Un 400 del schema sería una respuesta sobre la FORMA del cuerpo; esto
   * es una regla sobre qué se puede dar de alta, y por eso lleva su código.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Create a team access. Returns the delivery card; the PIN is shown once and never again.',
  })
  @ApiCreatedResponse({
    description: 'The delivery card: alias, PIN, warnings',
  })
  @ApiUnprocessableEntityResponse({
    description:
      "role: 'owner' (the owner is who created the business), a branch of another business, session_ttl_hours: 0 on a staff, or the plan's member limit",
  })
  @ApiConflictResponse({
    description: 'The alias is already in use in this business',
  })
  @ApiForbiddenResponse({
    description:
      'No live membership, a paused one, a session outside the §5.2 promise, or branches the caller does not manage',
  })
  create(
    @CurrentUser() user: AuthUser,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body(new ZodValidationPipe(CreateBusinessMemberSchema))
    body: CreateBusinessMemberDto,
  ): Promise<BusinessMemberDeliveryCardDto> {
    return this.staffService.create(user, businessId, body);
  }

  /**
   * `PATCH /businesses/:businessId/staff/:memberId` — role, branches, session
   * policy. NOT status, NOT alias, NOT label: the three have their own reasons
   * (see `UpdateBusinessMemberSchema`).
   */
  @Patch(':memberId')
  @ApiOperation({
    summary:
      "Edit an access' role, branches or session TTL. Neither status nor alias is editable here.",
  })
  @ApiOkResponse({ description: 'The membership in its new state' })
  @ApiNotFoundResponse({ description: 'No such access in this business' })
  @ApiUnprocessableEntityResponse({
    description:
      "Promoting to 'owner', a branch of another business, or session_ttl_hours: 0 on a staff",
  })
  @ApiForbiddenResponse({
    description:
      'The access is outside the caller’s branches, or the caller has no live session inside the §5.2 promise',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body(new ZodValidationPipe(UpdateBusinessMemberSchema))
    body: UpdateBusinessMemberDto,
  ): Promise<BusinessMemberDto> {
    return this.staffService.update(user, businessId, memberId, body);
  }

  /**
   * `PATCH /businesses/:businessId/staff/:memberId/alias` — `business_members`
   * AND `auth.users.email` in one operation.
   *
   * Its own route and not a field of the `PATCH` above because the response
   * carries `alias_warnings`: a domain that is not Rolé's receives real mail, and
   * that is information the owner needs and nobody else can act on. The PIN is
   * NOT touched — two independent facts (§8/§9.4).
   */
  @Patch(':memberId/alias')
  @ApiOperation({
    summary:
      "Change the access' alias and the login address it mirrors. The PIN does not change.",
  })
  @ApiOkResponse({
    description: 'The membership, plus the §9.4 alias warnings',
  })
  @ApiConflictResponse({ description: 'The alias is already in use' })
  updateAlias(
    @CurrentUser() user: AuthUser,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body(new ZodValidationPipe(UpdateBusinessMemberAliasSchema))
    body: UpdateBusinessMemberAliasDto,
  ): Promise<UpdateBusinessMemberAliasResponseDto> {
    return this.staffService.updateAlias(user, businessId, memberId, body);
  }

  /**
   * `POST /businesses/:businessId/staff/:memberId/rotate` — a NEW PIN, and
   * **nothing else**.
   *
   * 200 and not 201: this is not a resource being created, it is an action that
   * returns the same card `POST /staff` returns. It does not ban the account and
   * does not close open sessions —`disable` is the operation that does, and the
   * two are named differently on purpose (§8).
   */
  @Post(':memberId/rotate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Generate a new PIN. Returns the delivery card; does NOT revoke open sessions.',
  })
  @ApiOkResponse({ description: 'The delivery card with the new PIN' })
  @ApiForbiddenResponse({
    description: 'The access is outside the caller’s branches',
  })
  rotatePin(
    @CurrentUser() user: AuthUser,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    // The body may be absent and nothing more: the PIN is generated server-side
    // with `crypto.randomInt`, and a `pin` inside would be a back door for the
    // client to choose its own credential. `.strict()` turns that into a 400
    // instead of a 200 with a PIN nobody picked, and `.optional()` is what keeps
    // the bodiless POST —the natural call for a rotation — from being a 400 too.
    @Body(new ZodValidationPipe(RotateBusinessMemberPinSchema))
    _body: RotateBusinessMemberPinDto,
  ): Promise<BusinessMemberDeliveryCardDto> {
    return this.staffService.rotatePin(user, businessId, memberId);
  }

  /**
   * `POST /businesses/:businessId/staff/:memberId/disable` — `status =
   * 'disabled'` AND the ban of the `auth.users`.
   *
   * The two go together because the second is the point: the row stops granting
   * anything through RLS and the ban kills the sessions open right now, the
   * persistent tablet session of §9.2 included. This is NOT delete: the row
   * stays so "who was here" is still answerable.
   */
  @Post(':memberId/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Pause an access and close its open sessions (ban). Not a delete: the row stays.',
  })
  @ApiOkResponse({ description: 'The membership, disabled' })
  @ApiUnprocessableEntityResponse({
    description: 'That membership is the owner’s, and owners are untouchable',
  })
  disableAccess(
    @CurrentUser() user: AuthUser,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ): Promise<BusinessMemberDto> {
    return this.staffService.disableAccess(user, businessId, memberId);
  }

  /** `POST …/:memberId/enable`: the same operation in reverse, ban lifted. */
  @Post(':memberId/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reactivate an access and lift the ban on its login.',
  })
  @ApiOkResponse({ description: 'The membership, active' })
  enableAccess(
    @CurrentUser() user: AuthUser,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ): Promise<BusinessMemberDto> {
    return this.staffService.enableAccess(user, businessId, memberId);
  }

  /**
   * `DELETE /businesses/:businessId/staff/:memberId` — soft delete: `deleted_at`
   * on the membership and on its scope rows, plus the ban.
   *
   * **OWNER ONLY, and the service is where that is decided**: it is the only one
   * of the nine routes whose table cell says `owner` and nothing else, and this
   * is the irreversible one — it burns an identifier forever, the alias does not
   * go back to the bag. `requireActor` opens the door and then this service
   * refuses a `manager` with a 403 that says it is the owner's operation.
   *
   * 204 and no body: `remove()` returns nothing, and an operation that answers
   * `200 {}` invites a client to read a field that is not there.
   */
  @Delete(':memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Soft-delete an access (owner only). The row stays, the alias stays burned.',
  })
  @ApiNoContentResponse({ description: 'The access was given down' })
  @ApiForbiddenResponse({
    description:
      'The caller is not the owner of this business, or has no live session inside the §5.2 promise',
  })
  @ApiUnprocessableEntityResponse({
    description: 'That membership is the owner’s, and owners are untouchable',
  })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ): Promise<void> {
    return this.staffService.remove(user, businessId, memberId);
  }
}
