import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  TransferBusinessOwnershipSchema,
  type TransferBusinessOwnershipDto,
  type TransferBusinessOwnershipResponseDto,
} from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { StaffService } from './staff.service';

/**
 * La TRANSFERENCIA de propiedad, y su propia puerta.
 *
 * ─── POR QUÉ UN CONTROLADOR PROPIO Y NO UNO MÁS EN `staff.controller.ts` ──────
 *
 * Porque el prefijo dice de qué trata la ruta. Las ocho rutas de
 * `businesses/:businessId/staff` son del EQUIPO: se listan, se dan de alta, se
 * editan, se rotan, se pausan y se archivan. Esta no es del equipo: es de la
 * PROPIEDAD, que es una cosa distinta y con una consecuencia distinta —el dueño
 * de hoy deja de serlo— y con un destinatario distinto de la respuesta.
 *
 * Y porque la ruta que devuelve un dueño NO devuelve un acceso del equipo: no
 * lleva el PIN, no lleva la tarjeta de entrega, y no se parece en nada a las
 * otras ocho. Un controller por archivo, como el resto del repo, y el nombre
 * de cada uno dice a qué pertenece la ruta.
 *
 * ─── POR QUÉ NO HAY `@Roles` AQUÍ ─────────────────────────────────────────────
 *
 * Por la misma razón que no lo hay en las otras ocho: un `@Roles` mide
 * `profiles.role`, que es el `app_role` de la cuenta —negocio o consumidor— y
 * no lleva TTL. Lo que decide aquí es la MEMBRESÍA: `role = 'owner'` de una
 * fila viva de este negocio, con la sesión dentro de la promesa del §5.2. Y lo
 * decide el servicio, que es donde ya vive `requireActor`.
 *
 * ─── POR QUÉ 200 Y NO 201 ────────────────────────────────────────────────────
 *
 * Porque no se crea un recurso: se ejecuta una operación sobre dos filas que
 * ya existían. La respuesta es el estado nuevo de esas dos filas —el dueño
 * saliente como `manager` y el receptor como `owner`— y no un identificador
 * de algo recién creado.
 */
@ApiTags('Ownership')
@ApiBearerAuth('bearer')
@Controller('businesses/:businessId/ownership')
export class OwnershipController {
  constructor(private readonly staffService: StaffService) {}

  /**
   * `POST /businesses/:businessId/ownership/transfer` — the owner hands the
   * business over to another live access of the same business.
   *
   * The operation is ONE database transaction: the old owner is demoted, the
   * recipient is promoted, the outgoing owner keeps the scope of every branch,
   * and `business_ownership` is pointed at the new owner — all of it together,
   * so there is never a moment in which the business has two owners or none.
   */
  @Post('transfer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Transfer the ownership of the business to another live access. The outgoing owner stays as a manager with the scope of every branch.',
  })
  @ApiOkResponse({
    description: 'The two memberships in their new state',
  })
  @ApiForbiddenResponse({
    description:
      'The caller is not the owner of this business, or has no live session inside the §5.2 promise',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'The recipient is not a live access of this business, or the plan does not allow the operation',
  })
  transfer(
    @CurrentUser() user: AuthUser,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body(new ZodValidationPipe(TransferBusinessOwnershipSchema))
    body: TransferBusinessOwnershipDto,
  ): Promise<TransferBusinessOwnershipResponseDto> {
    return this.staffService.transferOwnership(user, businessId, body);
  }
}
