import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  StampStaffSessionSchema,
  type StampStaffSessionDto,
  type StaffSessionState,
} from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { StaffService } from './staff.service';

/**
 * `POST /staff/session` — the ninth §8 route, and the only one any member may call.
 *
 * ─── POR QUÉ ESTE ARCHIVO NO ES `staff.controller.ts` ──────────────────────────
 *
 * Porque no administra nada: sella. Las otras ocho cuelgan de
 * `businesses/:businessId/staff` y todas rechazan a un `staff` con un 403 en la
 * puerta; esta no, y su tabla en el §8 dice «cualquier miembro». Un lector que
 * abriera `staff.controller.ts` buscando «las rutas del equipo» leería ocho y
 * concluiría que un empleado no tiene ninguna —que es la lectura equivocada en la
 * dirección que más daña—. El nombre del archivo dice lo que la ruta es: no
 * pertenece a un negocio, y por eso tampoco se le pone prefijo de negocio.
 *
 * ─── POR QUÉ NO PASA POR `requireActor` ────────────────────────────────────────
 *
 * Es la operación que hace posible explicar una salida: quien entra después de
 * una pausa o de una baja necesita una respuesta que diga QUÉ pasó, y un 403 en
 * la puerta es un error genérico en la pantalla cuyo trabajo es exactamente
 * explicarla. `stampSession` sella si la fila está activa y devuelve lo que
 * `business_member_session_state` conteste —`no_membership`, `disabled`,
 * `session_expired`— sin negarse nunca. Por eso tampoco lleva `@Roles`: el rol de
 * la plataforma no es lo que decide acá, y además un `staff` tiene que poder
 * llamarla.
 *
 * Es también la razón de que el sello vaya con `service_role`: `business_members`
 * no tiene policy de escritura (§6.3), así que un `update` de cliente no da
 * `42501` —actualiza CERO filas en silencio— y deja la sesión donde estaba.
 *
 * ─── POR QUÉ EL `@ApiTags` ES EL MISMO QUE EL DE LAS OCHO ─────────────────────
 *
 * Porque en `/docs` las nueve tienen que aparecer juntas: son una sola pantalla
 * del panel, y dividirlas en dos tags según el prefijo del path haría que el que
 * busca «equipo» no encontrara la ruta que sella la sesión.
 */
@ApiTags('Staff')
@ApiBearerAuth('bearer')
@Controller('staff')
export class StaffSessionController {
  constructor(private readonly staffService: StaffService) {}

  /**
   * 200 and not 201: nothing is created. A stamp is a write to a column, and a
   * 201 would tell the panel's client that there is a resource to keep.
   *
   * ─── EL CUERPO PUEDE NO TRAER `business_id`, Y ESO NO ES UN DEFAULT ─────────
   *
   * Sin `business_id` la resolución la hace **la base**:
   * `business_member_session_state()` sin argumento devuelve la membresía del que
   * pregunta cuando tiene exactamente una activa, `multiple_businesses` con la
   * lista cuando tiene varias, y `no_membership` / `disabled` cuando no tiene
   * ninguna. El controller no elige: le pasa el `null` al servicio y transmite lo
   * que la función conteste.
   *
   * Y en el caso de varias no se sella NADA, porque sellar es escribir en UNA fila
   * y adivinar cuál renovaría la sesión de un negocio en el que la persona quizá
   * no está trabajando. Sellar el equivocado es peor que no sellar, así que la
   * respuesta es `multiple_businesses` con `business_ids` para que el panel
   * pregunte cuál y vuelva con el argumento.
   */
  @Post('session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Stamp last_authenticated_at and return the §5.2 session state the database computes. Omit business_id and the database resolves the caller’s single membership; with several, it answers multiple_businesses and seals nothing.',
  })
  @ApiOkResponse({
    description:
      'The session state, verbatim from business_member_session_state — never a 403 for a membership that cannot operate',
  })
  stampSession(
    @CurrentUser() user: AuthUser,
    // El cuerpo puede NO EXISTIR: un `POST` sin body deja `req.body` como
    // `undefined` en el stack real, y `body?.business_id` es lo que hace que esa
    // llamada —la más natural después de un login— llegue al servicio con `null` en
    // vez de morirse en el pipe. `undefined` y `{}` significan lo mismo: «no sé
    // en qué negocio estoy, resolvelo».
    @Body(new ZodValidationPipe(StampStaffSessionSchema))
    body: StampStaffSessionDto,
  ): Promise<StaffSessionState> {
    return this.staffService.stampSession(user, body?.business_id ?? null);
  }
}
