import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import {
  BusinessMemberAliasSchema,
  businessMemberAliasWarnings,
  UpdateBusinessMemberAliasSchema,
  type BusinessMemberDeliveryCardDto,
  type BusinessMemberDto,
  type BusinessMemberRole,
  type CreateBusinessMemberDto,
  type StaffSessionState,
  type RestoreBusinessOwnershipDto,
  type RestoreBusinessOwnershipResponseDto,
  type TransferBusinessOwnershipDto,
  type TransferBusinessOwnershipResponseDto,
  type UpdateBusinessMemberAliasDto,
  type UpdateBusinessMemberAliasResponseDto,
  type UpdateBusinessMemberDto,
} from '@0xc1x/role-commons';
import { safeErrorFields } from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { StaffMapper } from './staff.mapper';
import {
  StaffRepository,
  type BusinessMemberRow,
  type MemberWithScope,
  type OwnershipAssignResult,
  type OwnershipTransferResult,
} from './staff.repository';
import { STAFF_AUTH_ADMIN, type StaffAuthAdmin } from './staff.tokens';

/**
 * How many digits the PIN has (§3.1), and the ceiling the §8 delivery card
 * regexes.
 *
 * SIX, and it is `^\d{6}$` on the card, `z.string().min(6)` on the login and 6
 * on GoTrue's floor. The width is a shared fact and lives in `packages/commons`
 * because three places have to move together; what is local here is the SOURCE of
 * the number, and a `padStart` that dropped a digit would turn `418902` into
 * `41890` — a PIN the login would accept and nobody could read out loud.
 */
const PIN_DIGITS = 6;

/**
 * `ban_duration` for a revoked access. Ten years is "for a long time that is not
 * a sentence": GoTrue wants a duration, and the §8 promise is that a disabled or
 * removed access cannot come back by itself.
 */
const BAN_DURATION = '876000h';

/** The Postgres codes this module translates instead of forwarding. */
const PG_UNIQUE_VIOLATION = '23505';
const PG_PLAN_LIMIT = 'R0001';
const PG_OWNER_UNTOUCHABLE = 'R0002';
/**
 * `R0004`: la operación de PROPIEDAD se negó.
 *
 * Y es un código NUEVO, y no `R0001` ni `R0003`, por dos razones que están
 * escritas en el plan: `R0003` está reservado para separar la *entitlement* del
 * tope de plan —una decisión que este plan no toma—, y `R0001` ya significa dos
 * cosas (el tope y la entitlement) y no puede absorber una tercera sin que el
 * panel tenga que parsear el `detail` para distinguirla.
 */
const PG_OWNERSHIP_REFUSED = 'R0004';

const ALIAS_CONSTRAINT = 'business_members_alias_key';
const ONE_OWNER_CONSTRAINT = 'business_members_one_owner_per_business';
const MEMBER_PER_BUSINESS_CONSTRAINT =
  'business_members_business_id_user_id_key';

/**
 * The reach of whoever is calling, resolved once per request.
 *
 * There is NO `locationIds` here, and its absence is the point: the caller's
 * branches are not what decides anything. The reach rule lives in the database
 * (`business_member_reaches_member` and
 * `business_member_covers_locations`), which answers it for the caller that the
 * transaction declares. An actor that carried its own copy of the branches
 * would be a second implementation of a rule that is supposed to have one.
 */
type StaffActor = {
  userId: string;
  businessId: string;
  role: BusinessMemberRole;
};

/** The SQL shape of a raise that carries machine-readable detail. */
type PostgresLikeError = {
  code?: string;
  constraint_name?: string;
  message?: string;
  detail?: string;
};

function asPostgresError(error: unknown): PostgresLikeError | null {
  if (error instanceof Error) return error as PostgresLikeError;
  if (typeof error === 'object' && error !== null) {
    return error as PostgresLikeError;
  }
  return null;
}

/**
 * `business_member_session_expires_at` and the `reason` that reads it — IN SQL,
 * where they live, and not here.
 *
 * THIS IS A DELETION, NOT A MOVE. `can_manage_location`,
 * `business_member_session_valid` and `business_member_session_state` each used to
 * carry their own inline copy of `last_authenticated_at + session_ttl_hours *
 * interval '1 hour'`, and Plan 1 spent two review rounds collapsing them into one
 * `business_member_session_expires_at`. A fourth copy in TypeScript is invisible to
 * the guard that prevents the first three: that test reads `pg_proc.prosrc` and
 * cannot see a `.ts` file. The cost is not a lint, it is a panel that shows an
 * `expires_at` computed in a different language from the one RLS enforces, and
 * nothing goes red when the two disagree.
 *
 * So the service asks `StaffRepository.sessionStateAsCaller` — the same
 * `business_member_session_state` the panel already calls with its own JWT — and
 * returns what it answers. There is no fallback: a fallback copy is still a copy.
 * If the function cannot be called, the request fails loudly, which is the correct
 * outcome for a screen whose job is to explain an exit it cannot compute.
 */
@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly repository: StaffRepository,
    @Inject(STAFF_AUTH_ADMIN) private readonly authAdmin: StaffAuthAdmin,
  ) {}

  // ─────────────────────────────── lecturas ───────────────────────────────

  /**
   * `GET /businesses/:businessId/staff`.
   *
   * The list is not "every row the caller could edit, filtered": for a `manager`
   * it is a LIST OF WHAT THEY MANAGE, and the two are not the same set in spirit
   * — `alias` mirrors `auth.users.email`, so an access that leaks into the list
   * leaks a login address. The filter is therefore applied to the members that
   * come back, not to the buttons that get enabled afterwards.
   */
  async list(user: AuthUser, businessId: string): Promise<BusinessMemberDto[]> {
    // A platform `admin` supervises read-only (§10) and has no membership to be
    // contained in, so it sees the whole business. It cannot WRITE anything
    // below: `requireActor` refuses it before any membership is read.
    if (user.role === 'admin') {
      return this.allMembersOf(businessId);
    }

    const actor = await this.requireActor(user, businessId);
    const members = await this.repository.listMembersWithScope(businessId);

    // ─── UNA IDA A LA BASE POR ACCESO, Y ES UN COSTE CONSCIENTE ──────────────
    //
    // La regla la contesta la base, y la base la contesta de a uno en uno: no
    // hay helper que devuelva el conjunto de ids alcanzables. El roster está
    // topado por plan —2 accesos en `free`, 20 en `pro`, sin tope en
    // `pro_plus`—, así que el peor caso son veinte idas. Una versión de una
    // sola llamada es una decisión de performance, y este plan no la toma.
    const reachable: MemberWithScope[] = [];
    for (const member of members) {
      if (await this.reaches(actor, member.row)) reachable.push(member);
    }

    return reachable.map((member) =>
      StaffMapper.toMemberDto(member.row, member.locationIds),
    );
  }

  /**
   * `POST /staff/session`: stamps `last_authenticated_at` and explains the state.
   *
   * It is the one method that does not refuse, and that is the feature: the §5.2
   * panel has to be able to tell "you were paused" from "I don't know you", so the
   * answer to a membership that cannot operate is a `StaffSessionState`, not a
   * 403. Refusing here would leave the panel with a generic error on the exact
   * screen whose job is to explain the exit.
   *
   * ─── EL NOMBRE DEL NEGOCIO, Y CUÁNDO NO HAY QUE TENERLO ─────────────────────
   *
   * `businessId` es `null` cuando la llamada no lo nombró, y eso NO es un caso
   * degenerado: es la llamada que el §5.2 describe («un endpoint que el panel
   * llama una vez, después del login») en la forma en que un panel recién
   * autenticado la hace, sin saber todavía en qué negocio está.
   *
   * Con `null` la resolución la hace **la base**, no este archivo:
   * `business_member_session_state()` sin argumento devuelve la membresía del
   * que pregunta cuando tiene exactamente una activa, `multiple_businesses` con
   * la lista cuando tiene varias, y `no_membership` / `disabled` cuando no tiene
   * ninguna. Es la tabla del §5.2 y es la razón por la que el argumento de la
   * función existe siendo opcional: el dueño real tiene seis negocios y elegir la
   * fila más antigua devuelve el equivocado sin avisar.
   *
   * ─── Y CUANDO HAY VARIAS, LA RESPUESTA LO DICE Y NO SE SELLA ─────────────────
   *
   * Sellar es escribir `last_authenticated_at` en UNA fila, y adivinar cuál sería
   * renovar la sesión de un negocio en el que la persona quizá no está trabajando
   * —renovar la sesión equivocada es peor que no renovar ninguna—, así que en
   * ese caso la respuesta es el `multiple_businesses` de la función y el
   * `business_ids` que trae para que el panel pregunte cuál. La segunda lectura
   * no se hace porque no hay nada que leer después de un sello que no ocurrió.
   */
  async stampSession(
    user: AuthUser,
    businessId: string | null,
  ): Promise<StaffSessionState> {
    if (businessId === null) {
      const probe = await this.repository.sessionStateAsCaller(null, user.id);

      // ─── EL DATO ESTRUCTURAL, NO EL VOCABULARIO DE `reason` ──────────────────
      //
      // `business_ids` con exactamente un elemento significa que la función
      // resolvió una membresía: es el único caso en que la base devuelve una
      // lista de longitud uno, y se lo usa como HECHO sobre la respuesta en vez
      // de como un `reason` conocido. Un motivo nuevo en la base no cambia esta
      // decisión —sellar la única membresía que hay sigue siendo lo correcto— y
      // una razón desconocida no abre nada.
      //
      // `at(0)` y no `[0]` porque el repo compila con `noUncheckedIndexedAccess`:
      // el índice sale `string | undefined` aunque la longitud sea uno. Y el
      // `length !== 1` de la guarda es una condición REAL, no un molde para el
      // compilador — `business_ids` con dos elementos tiene que negarse a sellar
      // aunque `.at(0)` devuelva algo, porque renovar la fila equivocada es
      // justamente lo que esta rama existe para no hacer.
      const only = probe.business_ids.at(0) ?? null;

      if (only === null || probe.business_ids.length !== 1) {
        this.logger.log({
          event: 'staff_session_unresolved',
          userId: user.id,
          reason: probe.reason,
          businessCount: probe.business_ids.length,
        });

        return probe;
      }

      return this.sealAndExplain(user, only);
    }

    return this.sealAndExplain(user, businessId);
  }

  /**
   * Sella UNA membresía nombrada y devuelve lo que la función dice de ella.
   *
   * Las dos formas de llamar a `POST /staff/session` terminan acá, y es a propósito
   * que compartan el cuerpo entero: la resolución de «en qué negocio» es lo único
   * que distingue a la llamada que lo nombró de la que no, y desde este punto
   * hacia abajo las dos son la MISMA operación. Dos copias del sello serían dos
   * lugares donde el orden stamp-then-read puede desacoplarse, y ese orden es la
   * promesa del §5.2.
   *
   * ─── EL SELLO PRIMERO Y LA EXPLICACIÓN DESPUÉS, EN ESE ORDEN ─────────────────
   *
   * `stampSession` writes with `service_role` and the read happens AFTER the
   * stamp, on purpose: an expired session that signs in again has to come back
   * as `ok`, and no arithmetic computed before the stamp can say that. The row
   * the stamp returns feeds nothing of the state —only the log—, because the
   * state is what the function says, and the function just read the row.
   *
   * The two exits with no session —`no_membership` and `disabled`— are not
   * assembled here as constants either: the same question is asked and whatever
   * the function answers is returned, which is where those two
   * `jsonb_build_object` live and where they will keep living if they change.
   */
  private async sealAndExplain(
    user: AuthUser,
    businessId: string,
  ): Promise<StaffSessionState> {
    const row = await this.repository.findMemberByUser(businessId, user.id);

    if (row?.status === 'active') {
      await this.repository.stampSession(businessId, user.id, new Date());

      this.logger.log({
        event: 'staff_session_stamped',
        businessId,
        memberId: row.id,
        role: row.role,
      });
    }

    return this.repository.sessionStateAsCaller(businessId, user.id);
  }

  // ──────────────────────────────── altas ─────────────────────────────────

  /**
   * `POST /businesses/:businessId/staff`: the `auth.users` + the membership, and
   * the PIN, once.
   *
   * TWO systems and ONE operation for the caller, so the create is COMPENSATED:
   * if the membership insert fails the `auth.users` this call just created is
   * deleted before the error leaves, exactly like `BusinessesService.onboard`
   * (`businesses.service.ts:114-157`). Without it a retry from the same form
   * finds the alias taken by an account nobody can reach — the alias index
   * includes archived rows precisely so that this cannot be papered over.
   *
   * ─── Y LA PUERTA DE LA PLATAFORMA, QUE ES OTRA PUERTA AL MISMO CAMINO ───────
   *
   * Un negocio cuyo dueño se fue puede quedarse SIN NINGÚN acceso, y entonces
   * no hay ni a quién transferirle la propiedad ni quién administre el negocio
   * que queda. La recuperación son dos pasos y las dos puertas existen: este
   * (crear el acceso) y `POST /businesses/:id/ownership/restore` (darle el
   * nombre).
   *
   * La rama del admin es DELTA y su condición es DOBLE: `user.role ===
   * 'admin'` Y el negocio no tiene dueño vivo. Un admin NO administra un
   * negocio con dueño —eso se le niega a propósito (ítem 11 de la herencia)— y
   * `requireActor` sigue negándoselo; lo único que la rama abre es el alta en
   * un negocio que se quedó sin nadie.
   *
   * Y la rama vive AQUÍ y no en `requireActor`: en la puerta común, un admin
   * podría administrar cualquier negocio sin dueño —y de paso cualquier
   * negocio CON dueño, que es justo lo que se le niega.
   */
  async create(
    user: AuthUser,
    businessId: string,
    body: CreateBusinessMemberDto,
  ): Promise<BusinessMemberDeliveryCardDto> {
    const isPlatformAdmin = user.role === 'admin';
    const actor = isPlatformAdmin
      ? null
      : await this.requireActor(user, businessId);

    // §8: an owner is who created the business. `CreateBusinessMemberSchema`
    // accepts the whole vocabulary ON PURPOSE — the partner put this rejection
    // here so it could be a 422 with a reason, instead of a schema 400 that only
    // says "unknown value".
    const role = body.role ?? 'staff';
    if (role === 'owner') {
      throw new UnprocessableEntityException(
        'El dueño es quien creó el negocio: el alta da de alta empleados y gerentes, no dueños.',
      );
    }

    const business = await this.repository.findBusiness(businessId);
    if (!business) {
      throw new NotFoundException('Negocio no encontrado');
    }

    // §5.1: the entitlement is consulted BEFORE the alta, and the answer comes
    // from the database. Without this, the first plan without `staff_access`
    // would hit the trigger's raw `P0001` and the owner would get a 500 with
    // Postgres' prose in the log instead of the refusal he can act on.
    await this.assertStaffAccessEntitlement(businessId);

    const locationIds = await this.resolveLocations(
      businessId,
      body.business_location_ids,
    );
    if (actor) {
      // The reach of the caller decides whether it may create this access here.
      // A platform admin has NO reach —it is not a member of any business— and
      // the branch that let it in does not ask: it administers the whole
      // platform, and the business it is touching is one that has nobody.
      await this.assertWithinReach(actor, locationIds);
    } else {
      await this.requireOwnerlessBusiness(businessId);
    }
    this.assertPersistentSessionIsAllowed(role, body.session_ttl_hours);

    const alias = body.alias ?? this.proposedAlias(business.slug, body.label);
    const parsedAlias = BusinessMemberAliasSchema.safeParse(alias);
    if (!parsedAlias.success) {
      throw new BadRequestException(
        'El alias tiene que ser un correo válido: es con el que la persona entra.',
      );
    }

    // The PIN is generated HERE, server-side, and never stored: it is the
    // password of the `auth.users` this call creates. Six digits, as a STRING,
    // because `000731` has to survive the trip to the login and back.
    const pin = this.generatePin();

    const { data, error } = await this.authAdmin.auth.admin.createUser({
      email: parsedAlias.data,
      password: pin,
      // No mail is sent by this call either way (§8), and `email_confirm: true`
      // is what keeps the login usable: an unconfirmed account cannot sign in,
      // and nothing in this flow is going to confirm it by mail.
      email_confirm: true,
      user_metadata: { role: 'business' },
    });
    if (error || !data.user) {
      throw this.mapAuthAdminError(error?.message);
    }
    const userId = data.user.id;

    try {
      await this.repository.transaction(async (tx) => {
        const member = await this.repository.insertMember(tx, {
          business_id: businessId,
          user_id: userId,
          role,
          label: body.label,
          alias: parsedAlias.data,
          ...(body.session_ttl_hours === undefined
            ? {}
            : { session_ttl_hours: body.session_ttl_hours }),
        });
        if (locationIds.length > 0) {
          await this.repository.setScope(tx, member.id, locationIds);
        }
      });
    } catch (err) {
      await this.compensateCreatedUser(userId, businessId);
      throw this.mapWriteError(err);
    }

    this.logger.log({
      event: 'staff_access_created',
      businessId,
      // `actor` is null on the platform branch, and there the caller is the
      // admin: `requireActor` returns the caller's own id, so the two are the
      // same person and the log says who asked.
      createdBy: actor?.userId ?? user.id,
      role,
      locationCount: locationIds.length,
      aliasDomain: this.aliasDomain(parsedAlias.data),
    });

    return {
      alias: parsedAlias.data,
      pin,
      alias_warnings: businessMemberAliasWarnings(parsedAlias.data),
    };
  }

  // ─────────────────────────────── edición ────────────────────────────────

  /**
   * `PATCH /businesses/:businessId/staff/:memberId`: role, branches, session
   * policy.
   *
   * Containment is checked TWICE and both checks are needed: the first on the
   * reach the access HAS (a manager may not touch a colleague who writes a branch
   * outside their own, even to narrow him), the second on the reach the access is
   * ABOUT TO HAVE (a manager may not widen someone past their own branches). With
   * only the second, the first edit of a `{A, C}` access would already have
   * happened.
   */
  async update(
    user: AuthUser,
    businessId: string,
    memberId: string,
    body: UpdateBusinessMemberDto,
  ): Promise<BusinessMemberDto> {
    const actor = await this.requireActor(user, businessId);
    const member = await this.requireMember(businessId, memberId);
    await this.assertCanReachMember(actor, member);

    if (body.role === 'owner') {
      // La promoción existe, pero NO por esta vía: la propiedad se transfiere
      // con la operación que degrada al dueño viejo y promueve al receptor en
      // la MISMA transacción. Un `PATCH` que promueve es una degradación
      // disfrazada, y una degradación suelta deja al negocio sin dueño.
      throw new UnprocessableEntityException(
        'Un acceso no se promueve a dueño por esta vía: la propiedad se transfiere con POST /businesses/:businessId/ownership/transfer.',
      );
    }

    // ─── EL DUEÑO NO SE DEGRADA, Y HAY UNA PUERTA QUE SÍ LO ABRE ──────────────
    //
    // `PATCH {"role":"manager"}` sobre la fila del PROPIO dueño lo dejaba sin
    // dueño: las puertas owner-only niegan a todos (incluido el degradado),
    // `listForUser` lo borra del listado del panel y ninguna ruta puede
    // devolver `role: 'owner'` — la promoción es un 422 desde el §5.4. El
    // negocio quedaba inmanejable e invisible con una operación de una línea.
    //
    // La transferencia atómica EXISTE, y por eso degradar se sigue negando acá
    // —antes de escribir, y sin depender del texto del trigger— además de
    // negarse en la base: el trigger diferido aborta al commit la degradación
    // suelta de un negocio que sigue activo. El mensaje nuevo nombra la puerta
    // que sí abre, porque un mensaje que manda al operador a una puerta que no
    // existe es peor que uno que no da ninguna.
    if (body.role !== undefined && member.role === 'owner') {
      throw new UnprocessableEntityException(
        'Al dueño del negocio no se lo degrada: la propiedad se transfiere con POST /businesses/:businessId/ownership/transfer.',
      );
    }

    let locationIds: string[] | undefined;
    if (body.business_location_ids !== undefined) {
      locationIds = await this.resolveLocations(
        businessId,
        body.business_location_ids,
      );
      await this.assertWithinReach(actor, locationIds);
    }
    this.assertPersistentSessionIsAllowed(
      body.role ?? member.role,
      body.session_ttl_hours ?? member.session_ttl_hours,
    );

    try {
      await this.repository.transaction(async (tx) => {
        await this.repository.updateMember(
          businessId,
          memberId,
          {
            ...(body.role === undefined ? {} : { role: body.role }),
            ...(body.session_ttl_hours === undefined
              ? {}
              : { session_ttl_hours: body.session_ttl_hours }),
          },
          tx,
        );
        if (locationIds !== undefined) {
          await this.repository.setScope(tx, memberId, locationIds);
        }
      });
    } catch (err) {
      throw this.mapWriteError(err);
    }

    this.logger.log({
      event: 'staff_access_updated',
      businessId,
      memberId,
      updatedBy: actor.userId,
      roleChanged: body.role !== undefined,
      scopeChanged: locationIds !== undefined,
    });

    return this.memberDto(businessId, memberId);
  }

  /**
   * `PATCH /businesses/:businessId/staff/:memberId/alias`.
   *
   * The alias is TWO columns in TWO systems — `business_members.alias` and
   * `auth.users.email` — so "one operation" is achieved by compensating instead
   * of by a transaction that does not exist: the database write goes first and
   * the auth write second, because the unique index of the database is the error
   * the §8 wording cares about (`23505`, per business) and a failure there must
   * not have touched Auth yet. If Auth then refuses the address, the alias goes
   * back to what it was.
   *
   * THE PIN IS NOT TOUCHED. The alias is how the person identifies herself and
   * the PIN is the secret; they are two independent facts and §8/§9.4 say the
   * person keeps entering with the PIN she had until the owner rotates it.
   */
  async updateAlias(
    user: AuthUser,
    businessId: string,
    memberId: string,
    body: UpdateBusinessMemberAliasDto,
  ): Promise<UpdateBusinessMemberAliasResponseDto> {
    const actor = await this.requireActor(user, businessId);
    const member = await this.requireMember(businessId, memberId);
    await this.assertCanReachMember(actor, member);

    const parsed = UpdateBusinessMemberAliasSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        'El alias tiene que ser un correo válido: es con el que la persona entra.',
      );
    }
    const alias = parsed.data.alias;

    try {
      await this.repository.updateMember(businessId, memberId, { alias });
    } catch (err) {
      // Nothing to compensate: Auth has not been told anything yet.
      throw this.mapWriteError(err);
    }

    const { error } = await this.authAdmin.auth.admin.updateUserById(
      member.user_id,
      // `email_confirm: true` keeps the account usable. Without it GoTrue leaves
      // the address unconfirmed and the next login fails on a confirmation that
      // nobody is going to receive.
      { email: alias, email_confirm: true },
    );

    if (error) {
      await this.revertAlias(businessId, memberId, member.alias, user.id);
      throw this.mapAuthAdminError(error.message);
    }

    this.logger.log({
      event: 'staff_alias_updated',
      businessId,
      memberId,
      updatedBy: actor.userId,
      aliasDomain: this.aliasDomain(alias),
    });

    return {
      member: await this.memberDto(businessId, memberId),
      // The §9.4 warning: a domain that is not Rolé's really receives mail, so
      // the employee could turn on password recovery with that address. It is
      // information the owner needs and nobody else can act on it.
      alias_warnings: businessMemberAliasWarnings(alias),
    };
  }

  // ─────────────────────────────── la propiedad ───────────────────────────

  /**
   * `POST /businesses/:businessId/ownership/transfer`: el dueño entrega su
   * negocio a otro acceso vivo del mismo negocio.
   *
   * ─── POR QUÉ LA PUERTA ES LA MEMBRESÍA Y NO EL ROL DE PLATAFORMA ───────────
   *
   * Porque «dueño» es un rol del NEGOCIO, y la fila que lo dice es
   * `business_members`. El `app_role` de `profiles` dice si la cuenta es de
   * negocio o de consumidor, y un admin de plataforma no es miembro de ningún
   * negocio: `requireActor` lo niega, y con el mismo 403 que el de un
   * consumidor.
   *
   * ─── POR QUÉ UN GERENTE RECIBE 403 Y NO UN 404 ─────────────────────────────
   *
   * Por la misma regla que el resto del módulo: el refusal no dice si el acceso
   * receptor existe. Un gerente que recibiera un «no hay tal acceso» se
   * enteraría de que el id existe en otro negocio, y un id de membresía es un
   * dato que el panel no tiene por qué enseñarle. El 403 dice «esto es del
   * dueño», y nada más.
   *
   * ─── POR QUÉ LA OPERACIÓN NO SE REESCRIBE AQUÍ ─────────────────────────────
   *
   * Porque la transferencia es una operación de BASE: una función `security
   * definer` que degrada al dueño viejo, promueve al receptor y deja
   * `business_ownership` coherente, todo en una transacción. Dos llamadas de
   * API dejarían una ventana con dos dueños o con ninguno, y el índice parcial
   * `business_members_one_owner_per_business` no lo permite.
   *
   * Y esta capa NO vuelve a decidir quién puede transferir: la función comprueba
   * adentro que el llamador es el dueño vivo del negocio. El 403 de acá es la
   * puerta cómoda —y la que da un mensaje que el panel puede pintar—, no la
   * única.
   *
   * ─── Y LA AUDITORÍA ────────────────────────────────────────────────────────
   *
   * El repo no tiene una tabla de auditoría de negocio: `order_events` es de
   * pedidos, y nada más registra quién tocó qué. Lo que SÍ existe, y lo que
   * este módulo ya usa para cada operación del equipo, es el log estructurado
   * con un `event`. La transferencia entra por ahí —con los dos identificadores
   * de membresía y quién la pidió— y no por una tabla inventada: una tabla
   * nueva es un esquema nuevo que nadie pidió y que nadie lee.
   */
  async transferOwnership(
    user: AuthUser,
    businessId: string,
    body: TransferBusinessOwnershipDto,
  ): Promise<TransferBusinessOwnershipResponseDto> {
    const actor = await this.requireActor(user, businessId);
    if (actor.role !== 'owner') {
      throw new ForbiddenException(
        'Transferir la propiedad del negocio es del dueño, no de un gerente.',
      );
    }

    let result: OwnershipTransferResult;
    try {
      result = await this.repository.transferOwnership(
        businessId,
        body.new_owner_member_id,
        user.id,
      );
    } catch (err) {
      // `R0004` es una regla de negocio con su mensaje, y el mensaje es el de
      // la base: una frase que el dueño lee y que nombra la regla que falló.
      throw this.mapWriteError(err);
    }

    this.logger.log({
      event: 'business_ownership_transferred',
      businessId,
      previousOwnerMemberId: result.previous_owner_member_id,
      newOwnerMemberId: result.new_owner_member_id,
      transferredBy: actor.userId,
    });

    return {
      previous_owner: await this.memberDto(
        businessId,
        result.previous_owner_member_id,
      ),
      new_owner: await this.memberDto(businessId, result.new_owner_member_id),
    };
  }

  /**
   * `POST /businesses/:businessId/ownership/restore`: the platform gives a
   * business its owner back.
   *
   * ─── POR QUÉ ES ADMIN-ONLY Y POR QUÉ NO ES LA PUERTA DEL DUEÑO ───────────────
   *
   * Porque un negocio sin dueño no tiene a nadie que pueda entregar la
   * propiedad: la puerta del dueño (`transferOwnership`) exige que quien llama
   * SEA el dueño, y ese negocio no tiene uno. La recuperación la hace la
   * plataforma —un `app_role = 'admin'`— y es un hecho distinto de una
   * entrega: en la entrega hay dos personas y una entrega; en la recuperación
   * hay una plataforma y un negocio que se quedó solo.
   *
   * ─── Y POR QUÉ NO ES UNA SEGUNDA PUERTA PARA SALTARSE EL INVARIANTE ─────────
   *
   * Porque la operación es de BASE (`public.assign_business_ownership`) y la
   * base se niega con `R0004` si el negocio YA tiene un dueño vivo: para eso
   * está la transferencia. Promover a un acceso vivo deja exactamente un dueño,
   * que es lo que el índice parcial admite y lo que el trigger diferido exige
   * al commit. La ruta no puede dejar un negocio con dos dueños ni con
   * ninguno.
   *
   * ─── Y LA AUDITORÍA ─────────────────────────────────────────────────────────
   *
   * El repo no tiene una tabla de auditoría de negocio: `order_events` es de
   * pedidos. Lo que SÍ existe, y lo que este módulo ya usa para cada operación
   * del equipo, es el log estructurado con un `event`. La recuperación entra
   * por ahí —con el identificador de la membresía y quién la pidió— y no por
   * una tabla inventada.
   */
  async restoreOwnership(
    user: AuthUser,
    businessId: string,
    body: RestoreBusinessOwnershipDto,
  ): Promise<RestoreBusinessOwnershipResponseDto> {
    if (user.role !== 'admin') {
      throw new ForbiddenException(
        'Devolver el dueño a un negocio es de la plataforma, no de un miembro del negocio.',
      );
    }

    let result: OwnershipAssignResult;
    try {
      result = await this.repository.assignOwnership(
        businessId,
        body.member_id,
        user.id,
      );
    } catch (err) {
      // `R0004` es una regla de negocio con su mensaje, y el mensaje es el de
      // la base: una frase que el operador lee y que nombra la regla que falló.
      throw this.mapWriteError(err);
    }

    this.logger.log({
      event: 'business_ownership_restored',
      businessId,
      ownerMemberId: result.owner_member_id,
      ownerUserId: result.owner_user_id,
      restoredBy: user.id,
    });

    return {
      owner: await this.memberDto(businessId, result.owner_member_id),
    };
  }

  // ─────────────────────── PIN y revocación ───────────────────────────────

  /**
   * `POST /businesses/:businessId/staff/:memberId/rotate`: a NEW PIN.
   *
   * ─── LO QUE ESTE MÉTODO NO HACE, Y POR QUÉ EL NOMBRE LO DICE ───────────────
   *
   * No toca el ban y no revoca sesiones. El §8 lo llama "el peor resultado
   * posible de esta pantalla": un dueño que rota creyendo que cortó acceso deja
   * al empleado con la sesión abierta que quería cerrar, y no se da cuenta.
   * Por eso el método se llama `rotatePin` y el que cierra sesiones se llama
   * `disableAccess` —nombres que no se parecen— y por eso `disableAccess` es el
   * único que manda `ban_duration`.
   *
   * El PIN se genera server-side y se devuelve UNA VEZ. No hay columna donde
   * guardarlo: `business_members` no conoce el PIN, y por eso tampoco hay forma
   * de devolverlo por error más adelante.
   */
  async rotatePin(
    user: AuthUser,
    businessId: string,
    memberId: string,
  ): Promise<BusinessMemberDeliveryCardDto> {
    const actor = await this.requireActor(user, businessId);
    const member = await this.requireMember(businessId, memberId);
    await this.assertCanReachMember(actor, member);

    const pin = this.generatePin();
    const { error } = await this.authAdmin.auth.admin.updateUserById(
      member.user_id,
      { password: pin },
    );
    if (error) {
      throw this.mapAuthAdminError(error.message);
    }

    // No hay PIN en esta línea, ni en el `alias`, ni en el identificador de
    // Auth: el identificador de la sesión se puede correlacionar con un log y un
    // PIN se puede volver a usar contra el login.
    this.logger.log({
      event: 'staff_pin_rotated',
      businessId,
      memberId,
      rotatedBy: actor.userId,
    });

    return {
      alias: member.alias,
      pin,
      alias_warnings: businessMemberAliasWarnings(member.alias),
    };
  }

  /**
   * `POST /businesses/:businessId/staff/:memberId/disable`: revoke.
   *
   * Two effects that belong together, and the second is the reason the operation
   * exists at all: the row stops granting anything through RLS (§5.1 filters
   * `status = 'active'`) AND the `auth.users` is banned, which kills the sessions
   * that are open right now — including the persistent tablet session of §9.2,
   * which is exactly what `session_ttl_hours = 0` is for.
   *
   * The DATABASE write goes first, on purpose. `enforce_owner_is_untouchable`
   * raises `R0002` on an owner row, and a ban that lands before that check would
   * have locked the business out of its own business.
   *
   * If the ban fails the row stays disabled and the request FAILS anyway: half of
   * this operation is worse than none of it, because the owner was told "cut
   * access" while the tablet in the shop is still logged in. `disableAccess` is
   * idempotent, so the retry is the fix.
   *
   * ─── A MANAGER MAY DISABLE THEMSELVES. THAT IS A RULING, NOT A HOLE ─────────
   *
   * §8 lists the containment rule ("only accesses whose branches are contained in
   * yours") and never mentions the caller, so the predicate admits a manager
   * disabling their own row: their reach contains them, and the only other
   * exclusion —never administer the owner— is about a role, not about a person.
   * Allowed on purpose, for one argument:
   *
   * An owner CANNOT be deactivated by anybody —`enforce_owner_is_untouchable`
   * raises `R0002`, and `20261017040808` made it raise on the removal too— so
   * "you may always stop your own access" is ALREADY the rule for the most
   * privileged role in the system. A manager who cannot leave a business is
   * stranded in it, and a stranded manager is a worse failure than the one a
   * self-disable could ever cause: it needs somebody else to notice, and nobody
   * else is watching.
   *
   * Containment is untouched by this. It still refuses every OTHER manager outside
   * the caller's reach, and self-disable is the one case where the target is by
   * definition inside it. Both halves have tests: the permission and the refusal.
   * The full argument is decision 4 of
   * `docs/decisions/ADR-0013-accesos-de-staff-por-sucursal.md`.
   */
  async disableAccess(
    user: AuthUser,
    businessId: string,
    memberId: string,
  ): Promise<BusinessMemberDto> {
    const actor = await this.requireActor(user, businessId);
    const member = await this.requireMember(businessId, memberId);
    await this.assertCanReachMember(actor, member);

    try {
      await this.repository.updateMember(businessId, memberId, {
        status: 'disabled',
      });
    } catch (err) {
      throw this.mapWriteError(err);
    }

    const { error } = await this.authAdmin.auth.admin.updateUserById(
      member.user_id,
      { ban_duration: BAN_DURATION },
    );
    if (error) {
      this.logger.error({
        event: 'staff_access_ban_failed',
        businessId,
        memberId,
        revokedBy: actor.userId,
        ...safeErrorFields(error),
      });
      throw new InternalServerErrorException(
        'El acceso quedó pausado pero no se pudieron cerrar las sesiones abiertas. Reintentalo.',
      );
    }

    this.logger.log({
      event: 'staff_access_disabled',
      businessId,
      memberId,
      disabledBy: actor.userId,
    });

    return this.memberDto(businessId, memberId);
  }

  /** `POST …/enable`: the same operation in reverse, ban lifted. */
  async enableAccess(
    user: AuthUser,
    businessId: string,
    memberId: string,
  ): Promise<BusinessMemberDto> {
    const actor = await this.requireActor(user, businessId);
    const member = await this.requireMember(businessId, memberId);
    await this.assertCanReachMember(actor, member);

    try {
      await this.repository.updateMember(businessId, memberId, {
        status: 'active',
      });
    } catch (err) {
      throw this.mapWriteError(err);
    }

    const { error } = await this.authAdmin.auth.admin.updateUserById(
      member.user_id,
      { ban_duration: 'none' },
    );
    if (error) {
      this.logger.error({
        event: 'staff_access_unban_failed',
        businessId,
        memberId,
        enabledBy: actor.userId,
        ...safeErrorFields(error),
      });
      throw new InternalServerErrorException(
        'El acceso quedó activo pero el inicio de sesión sigue bloqueado. Reintentalo.',
      );
    }

    this.logger.log({
      event: 'staff_access_enabled',
      businessId,
      memberId,
      enabledBy: actor.userId,
    });

    return this.memberDto(businessId, memberId);
  }

  /**
   * `DELETE /businesses/:businessId/staff/:memberId`: dar de baja, no borrar.
   *
   * `deleted_at` on the membership AND on its scope rows, plus the ban of the
   * `auth.users`. The row stays for three reasons the §8 spells out: the alias
   * does not go back to the bag (the index has no partial predicate, so an
   * archived alias still collides), "who was here" stays answerable, and the
   * physical delete is a separate operation that v1 does not expose.
   *
   * OWNER ONLY. §8's route table says so and this is the irreversible one: it
   * burns an identifier forever. The prose in the same section lists "eliminar"
   * among the manager's powers inside the containment rule, and the two disagree;
   * the table wins because it is the one that names the route.
   */
  async remove(
    user: AuthUser,
    businessId: string,
    memberId: string,
  ): Promise<void> {
    const actor = await this.requireActor(user, businessId);
    if (actor.role !== 'owner') {
      throw new ForbiddenException(
        'Dar de baja un acceso es del dueño del negocio, no de un gerente.',
      );
    }
    const member = await this.requireMember(businessId, memberId);

    // ─── EL DUEÑO NO SE DA DE BAJA POR ESTA PUERTA ────────────────────────────
    //
    // Antes lo negaba el trigger de la base —«el dueño del negocio no se puede
    // dar de baja»— y el mensaje era el suyo. Hoy ese guard se fue: la baja de
    // un dueño la decide el INVARIANTE, al commit, y sólo para un negocio que
    // sigue activo. Un negocio INACTIVO puede quedarse sin dueño —es lo que
    // hace posible la liberación— y esta puerta NO es la de la liberación: no
    // borra la fila de `business_ownership`, y dejarla apuntando a un dueño
    // archivado es el «huérfano silencioso» que el móvil todavía lee.
    //
    // Así que la negativa vive ACÁ, y es la misma regla que dice que un dueño
    // no se degrada ni se pausa: el dueño se va ENTREGANDO el negocio, no
    // archivándose a sí mismo por la puerta del equipo.
    if (member.role === 'owner') {
      throw new UnprocessableEntityException(
        'Al dueño del negocio no se lo da de baja por esta puerta: la propiedad se transfiere con POST /businesses/:businessId/ownership/transfer.',
      );
    }

    try {
      await this.repository.transaction(async (tx) => {
        await this.repository.setScope(tx, memberId, []);
        await this.repository.softDeleteMember(tx, businessId, memberId);
      });
    } catch (err) {
      // `R0002` here means "that was the owner" — the trigger of
      // `20261017040808`. The row is untouched and no ban was sent.
      throw this.mapWriteError(err);
    }

    const { error } = await this.authAdmin.auth.admin.updateUserById(
      member.user_id,
      { ban_duration: BAN_DURATION },
    );
    if (error) {
      // Access is already cut: a `deleted_at` membership grants nothing by any
      // path (§6.3), so this is not an open door, it is a login that can no
      // longer do anything. The ban cannot be retried through this route —the row
      // is gone, so the next call is a 404— and saying otherwise would be a
      // promise the API cannot keep.
      this.logger.error({
        event: 'staff_access_ban_failed_after_removal',
        businessId,
        memberId,
        removedBy: actor.userId,
        ...safeErrorFields(error),
      });
      throw new InternalServerErrorException(
        'El acceso quedó dado de baja y ya no accede a nada, pero no se pudo cerrar su inicio de sesión.',
      );
    }

    this.logger.log({
      event: 'staff_access_removed',
      businessId,
      memberId,
      removedBy: actor.userId,
    });
  }

  // ─────────────────────────────── la puerta ───────────────────────────────

  /**
   * The one gate every write goes through, and the list goes through too.
   *
   * It answers four questions in the order that makes the least noise when the
   * answer is "no": is the caller a platform admin (they supervise, they do not
   * administer), is there a live membership, is it `active`, is it a role that
   * administers at all, and is its session still inside the §5.2 promise.
   *
   * The session is asked HERE, in this module's own context, and not left to a
   * guard: this API writes with `service_role`, where RLS does not apply, so the
   * guard's answer and this one would be two different frontiers for the same
   * question. The §5.2 promise is that an expired session does not operate, and
   * the only place that can be true for BOTH the panel's direct writes and this
   * API is a rule both of them apply.
   *
   * ─── AND THE QUESTION IS ASKED BY THE FUNCTION RLS ALREADY USES ──────────────
   *
   * The question being this API's does not make the answer this API's: the answer
   * comes from `business_member_session_state`, which reads the same number
   * `can_manage_location` applies to the row. This gate used to compare
   * `last_authenticated_at + ttl` in TypeScript, which made it one more frontier
   * with its own arithmetic; now both frontiers read one number and there is
   * nothing left that can drift apart quietly.
   *
   * Only `'ok'` passes. The two reasons §5.2 names —`session_expired` and
   * `session_never_stamped`— deny, and so does a reason this API does not know:
   * a new word in the database must not open the door by oversight. That case
   * goes to the log with its name, because a panel locked out with no line
   * explaining why is the worst outcome of denying on purpose.
   */
  private async requireActor(
    user: AuthUser,
    businessId: string,
  ): Promise<StaffActor> {
    if (user.role === 'admin') {
      throw new ForbiddenException(
        'Administrar los accesos del equipo es del dueño del negocio.',
      );
    }

    const row = await this.repository.findMemberByUser(businessId, user.id);
    if (!row) {
      throw new ForbiddenException('No perteneces a este negocio.');
    }
    if (row.status !== 'active') {
      throw new ForbiddenException('Tu acceso está pausado.');
    }
    if (row.role === 'staff') {
      throw new ForbiddenException(
        'Un empleado no administra los accesos del negocio.',
      );
    }

    const { reason } = await this.repository.sessionStateAsCaller(
      businessId,
      user.id,
    );
    if (reason !== 'ok') {
      if (reason !== 'session_expired' && reason !== 'session_never_stamped') {
        this.logger.warn({
          event: 'staff_session_reason_unknown',
          businessId,
          memberId: row.id,
          reason,
        });
      }
      throw new ForbiddenException(
        'Tu sesión venció. Entra otra vez para seguir administrando el equipo.',
      );
    }

    return {
      userId: user.id,
      businessId,
      role: row.role,
    };
  }

  /**
   * The platform's door to a business that has NO live owner.
   *
   * ─── POR QUÉ ES UNA COMPROBACIÓN DOBLE ──────────────────────────────────────
   *
   * Porque son dos hechos: que quien llama es de la plataforma (`user.role ===
   * 'admin'`, que el servicio ya comprobó antes de llegar acá) Y que el
   * negocio no tiene dueño vivo. Con uno solo de los dos, la puerta abriría
   * de más: un admin que pudiera administrar cualquier negocio —incluido uno
   * con dueño, que es lo que hoy se le niega a propósito (ítem 11 de la
   * herencia)—, o un miembro del negocio que pudiera darse su propio dueño.
   *
   * ─── Y POR QUÉ LA PREGUNTA LA HACE LA BASE ───────────────────────────────────
   *
   * Porque «¿tiene dueño vivo?» es la misma pregunta que hace
   * `public.assign_business_ownership` antes de promover a alguien, y las dos
   * tienen que tener la misma respuesta: si esta API contara los dueños con su
   * propio predicado, la puerta podría abrir un negocio que la operación
   * después cierra.
   */
  private async requireOwnerlessBusiness(businessId: string): Promise<void> {
    const business = await this.repository.findBusiness(businessId);
    if (!business) {
      throw new NotFoundException('Negocio no encontrado');
    }

    const liveOwners = await this.repository.liveOwnerCount(businessId);
    if (liveOwners > 0) {
      throw new ForbiddenException(
        'Un negocio con dueño no se administra desde la plataforma: ese dueño lo administra.',
      );
    }
  }

  /** A live access of THIS business, or a 404. */
  private async requireMember(
    businessId: string,
    memberId: string,
  ): Promise<BusinessMemberRow> {
    const member = await this.repository.findMemberById(businessId, memberId);
    if (!member) {
      throw new NotFoundException('Acceso no encontrado en este negocio.');
    }
    return member;
  }

  /**
   * Whether this caller reaches this access. ONE predicate for the list and for
   * the writes, because §8 says the same thing twice: a manager sees what they
   * manage and may touch what they manage.
   *
   * The `role = 'owner'` exclusion is not the containment rule —an owner row has
   * no branches, so containment would admit it vacuously— it is the §8 sentence
   * that a manager never administers the owner. Keeping it here means the list and
   * the writes cannot drift apart on it either.
   *
   * The CONTAINMENT, though, is not decided here: it is the database's answer,
   * and the only thing this method decides is which rule is whose. The §8
   * containment rule is a rule of SCOPE, and the scope lives in
   * `business_member_locations`.
   */
  private async reaches(
    actor: StaffActor,
    member: Pick<BusinessMemberRow, 'id' | 'role'>,
  ): Promise<boolean> {
    if (actor.role === 'owner') return true;
    if (member.role === 'owner') return false;
    return this.repository.reachesMember(
      actor.businessId,
      member.id,
      actor.userId,
    );
  }

  private async assertCanReachMember(
    actor: StaffActor,
    member: BusinessMemberRow,
  ): Promise<void> {
    if (await this.reaches(actor, member)) return;

    // Only a manager arrives here: `reaches` is unconditionally true for an
    // owner, so there is no "you do not administer this" message to write.
    throw new ForbiddenException(
      'Solo administras los accesos cuyas sucursales están dentro de las tuyas.',
    );
  }

  /**
   * The same rule, applied to a reach that is ABOUT TO BE WRITTEN.
   *
   * The database answers it, and the answer is the same one that decides
   * whether the caller reaches the access it is about to widen: a manager of
   * {A, B} can move an access to {A} or to {B}, and not to {A, C}.
   */
  private async assertWithinReach(
    actor: StaffActor,
    locationIds: readonly string[],
  ): Promise<void> {
    const covered = await this.repository.coversLocations(
      actor.businessId,
      locationIds,
      actor.userId,
    );
    if (covered) return;

    throw new ForbiddenException(
      'No puedes asignar sucursales que no gestionas.',
    );
  }

  /**
   * `session_ttl_hours = 0` —the "equipo propio" mode, no expiry— is for a role
   * that manages the business, never for an employee.
   *
   * §9.2 says it in the UI ("un `staff` no debería poder dejar un tablet abierto
   * para siempre") and the §9.3 rule is that the server is the one that has to
   * enforce it: a hidden button is not a rule. `business_members` has no CHECK for
   * it, and this API writes with `service_role`, so the only place the promise
   * can be true is here.
   *
   * The pair is `(role, ttl)` and not just the role, because the other half is
   * that a `manager` MAY have it — `0` is what a tablet in the manager's own
   * business needs.
   */
  private assertPersistentSessionIsAllowed(
    role: BusinessMemberRole,
    sessionTtlHours: number | undefined,
  ): void {
    if (sessionTtlHours !== 0) return;
    if (role === 'owner' || role === 'manager') return;

    throw new UnprocessableEntityException(
      'La sesión sin expiración es solo para dueños y gerentes; a un empleado dale una sesión por turnos.',
    );
  }

  /**
   * Checks that every requested branch belongs to this business, and returns the
   * ones that do.
   *
   * A branch of another business is a 422 about the REQUEST, and it is 422 para
   * quien sea que pregunte: this runs BEFORE `assertWithinReach`, porque una
   * sucursal que no es de este negocio no se alcanza ni se administra —comparar
   * ese id contra el alcance de un gerente que no tiene por qué conocerlo daría
   * un 403 sobre un dato que sólo el dueño puede resolver. El 403 del alcance
   * llega después, y sólo para la sucursal que SÍ es del negocio y está fuera
   * del alcance, que es el caso que el §8 describe.
   */
  private async resolveLocations(
    businessId: string,
    requested: readonly string[],
  ): Promise<string[]> {
    const unique = [...new Set(requested)];
    if (unique.length === 0) return [];

    const found = await this.repository.findLocationIdsInBusiness(
      businessId,
      unique,
    );
    if (found.length !== unique.length) {
      throw new UnprocessableEntityException(
        'Alguna de las sucursales no pertenece a este negocio.',
      );
    }
    return unique;
  }

  // ─────────────────────────────── lecturas ───────────────────────────────

  private async allMembersOf(businessId: string): Promise<BusinessMemberDto[]> {
    const members = await this.repository.listMembersWithScope(businessId);
    return members.map((member) =>
      StaffMapper.toMemberDto(member.row, member.locationIds),
    );
  }

  private async memberDto(
    businessId: string,
    memberId: string,
  ): Promise<BusinessMemberDto> {
    const member = await this.requireMember(businessId, memberId);
    return StaffMapper.toMemberDto(
      member,
      await this.repository.locationIdsOfMember(member.id),
    );
  }

  // ───────────────────────────────── el PIN ───────────────────────────────

  /**
   * Six digits, uniform, and a STRING.
   *
   * `randomInt` is uniform over the range and unbiased; `Math.random()` is not,
   * and a PIN that can be predicted from three of its digits is a PIN that can
   * be guessed. The `padStart` is what makes `418902` representable: without it a
   * leading zero disappears and the employee enters five digits, which is a
   * different credential than the one she was given.
   */
  private generatePin(): string {
    return randomInt(0, 10 ** PIN_DIGITS)
      .toString()
      .padStart(PIN_DIGITS, '0');
  }

  /**
   * `{código}@{slug}.role.ec` (§3.1), from the name the owner typed.
   *
   * The code is the person's NAME, not a random string: the §9.2 panel writes the
   * alias out loud and the employee has to type it on a phone, and `karla` beats
   * `x7fq2m`. It hangs off `role.ec` and never off the business's own domain,
   * because a GoTrue mail flow to somebody else's domain burns a domain the
   * business may want to use for real mail later.
   *
   * It is NOT unique by itself and does not pretend to be: two employees called
   * Carla in one business collide on `business_members_alias_key` and get the
   * `23505` mapped to "ese alias ya está en uso", which is a fact about the
   * business and a field the §9.4 form can change. Inventing a random suffix here
   * would hide the collision behind a string nobody can predict out loud.
   */
  private proposedAlias(businessSlug: string, label: string): string {
    const code = label
      .normalize('NFD')
      // Los diacríticos se van antes de filtrar: `Karla Pérez` tiene que
      // proponer `karla-perez` y no `karla-p-rez`.
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24);
    return `${code || 'acceso'}@${businessSlug}.role.ec`;
  }

  private aliasDomain(alias: string): string {
    return alias.split('@')[1] ?? '';
  }

  // ───────────────────────────── compensaciones ───────────────────────────

  /**
   * The create is two writes and the second one can fail: delete the
   * `auth.users` this request created, or leave an account with no access behind.
   *
   * Same shape and same order as `BusinessesService.onboard`: best effort with
   * the reason logged, because a compensation that fails must not hide the error
   * that caused it — and the error is the one the owner needs to see. The orphan
   * is logged with `userId`, which is the handle support would need to clean it.
   */
  private async compensateCreatedUser(
    userId: string,
    businessId: string,
  ): Promise<void> {
    const { error } = await this.authAdmin.auth.admin.deleteUser(userId);
    if (error) {
      this.logger.error({
        event: 'staff_access_compensation_failed',
        businessId,
        createdUserId: userId,
        ...safeErrorFields(error),
      });
    }
  }

  /**
   * Puts the alias back after GoTrue refused the new address.
   *
   * Best effort for the same reason as above: the member is already reachable
   * with the OLD alias if this succeeds, and if it does not, the `business_members`
   * row and the Auth address disagree and that has to be visible in the log.
   */
  private async revertAlias(
    businessId: string,
    memberId: string,
    previousAlias: string,
    actorId: string,
  ): Promise<void> {
    try {
      await this.repository.updateMember(businessId, memberId, {
        alias: previousAlias,
      });
    } catch (err) {
      this.logger.error({
        event: 'staff_alias_rollback_failed',
        businessId,
        memberId,
        actorId,
        ...safeErrorFields(err),
      });
    }
  }

  // ───────────────────────────── traducción ───────────────────────────────

  /**
   * The database answers in codes and this service answers in Spanish, because
   * the person reading it is an owner in the panel, not a developer with the log.
   *
   * Three translations and nothing else: the rest bubbles up as a 500, which is
   * what an unmapped database error IS.
   */
  private mapWriteError(error: unknown): Error {
    const postgresError = asPostgresError(error);
    if (!postgresError?.code) return this.asError(error);

    if (postgresError.code === PG_UNIQUE_VIOLATION) {
      switch (postgresError.constraint_name) {
        case ALIAS_CONSTRAINT:
          return new ConflictException(
            'Ese alias ya está en uso en este negocio.',
          );
        case ONE_OWNER_CONSTRAINT:
          return new UnprocessableEntityException(
            'Este negocio ya tiene un dueño.',
          );
        case MEMBER_PER_BUSINESS_CONSTRAINT:
          return new ConflictException(
            'Esa persona ya es miembro de este negocio.',
          );
        default:
          return this.asError(error);
      }
    }

    if (postgresError.code === PG_PLAN_LIMIT) {
      // `R0001`: the PLAN is the reason, so the message has to name it. The
      // `message` is the prose our own trigger wrote and the `detail` carries
      // business/plan/limit/current; the numbers are appended so a panel that
      // wants to draw "el plan free admite 2" does not have to read Spanish to
      // get them. Nothing is invented here: the message is the trigger's and the
      // tail is the `detail`, both of them ours.
      return this.planRefusal(
        postgresError.message ?? 'El plan no admite otro acceso.',
        postgresError.detail,
      );
    }

    if (postgresError.code === PG_OWNER_UNTOUCHABLE) {
      // `R0002`: the owner is untouchable and it is NOT the plan's fault. The
      // message is the trigger's own —a fixed string from our migration, and the
      // one that names the reason: la propiedad se transfiere, no se degrada.
      return new UnprocessableEntityException(
        postgresError.message ??
          'El dueño del negocio no se puede desactivar, degradar ni dar de baja.',
      );
    }

    if (postgresError.code === PG_OWNERSHIP_REFUSED) {
      // `R0004`: la operación de propiedad se negó, y el motivo es EL DE LA
      // BASE —«sólo el dueño puede transferir», «el receptor tiene que ser un
      // acceso vivo de este negocio»—.
      //
      // El mensaje NO se reescribe: la base es la que sabe qué regla falló, y
      // una traducción de segunda mano es una traducción que se aparta. Y no
      // es la prosa cruda de Postgres: es un `raise` nuestro, con su `detail` y
      // su `hint`, y lo que sale de acá es la frase que el dueño lee.
      return new UnprocessableEntityException(
        postgresError.message ??
          'La propiedad del negocio no se puede transferir con estos datos.',
      );
    }

    return this.asError(error);
  }

  /**
   * The plan's refusal — ONE body, TWO doors.
   *
   * The database's `R0001` (the LIMIT) and this API's own check (the FEATURE)
   * are the same answer for the panel: a 422, the plan as the reason, and a way
   * out. They share the body builder so the two refusals cannot drift into two
   * shapes, and the panel does not have to learn a second one.
   *
   * The `detail` is the tail: `business=… plan=… limit=… current=…` is what the
   * trigger wrote, and the numbers go into the message for a panel that wants
   * to draw "el plan free admite 2" without reading Spanish to get them.
   */
  private planRefusal(
    message: string,
    detail?: string,
  ): UnprocessableEntityException {
    const numbers = this.describePlanLimit(detail);
    return new UnprocessableEntityException({
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: `${message}${numbers}`,
    });
  }

  /**
   * The plan's entitlement for the staff feature — asked to the DATABASE.
   *
   * §5.1: "de esos tres, `business_has_feature` lo consulta la API antes de
   * cada alta". This is that consultation, and the catalogue is NOT copied here:
   * the answer is a boolean the database gives, and the only thing this file
   * decides is WHICH refusal to answer with.
   *
   * The refusal is the PLAN's (`R0001`), the same one the limit produces, and
   * not a new code: the panel already knows that a plan refusal is a 422 whose
   * answer is "subí de plan", and a code the panel has never seen is a code the
   * panel cannot react to. The limit is a COUNT and the feature is an
   * ENTITLEMENT, and a distinct code (`R0003`) would say that better — but the
   * panel's contract today is `R0001`, and inventing a second one without the
   * panel would break the one thing that works.
   *
   * The message does NOT name the plan, and that is a decision too: naming it
   * would mean asking `business_plan_of`, which is deliberately not executable
   * by clients (`business_has_feature` is the client-facing version of it). The
   * refusal says what the owner has to do, and that is what the panel shows.
   */
  private async assertStaffAccessEntitlement(
    businessId: string,
  ): Promise<void> {
    const entitled = await this.repository.hasStaffAccessFeature(businessId);
    if (entitled) return;

    throw this.planRefusal(
      'Este plan no incluye accesos de personal: subí de plan para administrar el equipo.',
    );
  }

  /** `business=… plan=… limit=… current=…` → ` (plan free: admite hasta 2, serían 3)`. */
  private describePlanLimit(detail: string | undefined): string {
    if (!detail) return '';
    const fields = new Map<string, string>();
    for (const part of detail.split(/\s+/)) {
      const [key, value] = part.split('=');
      if (key && value) fields.set(key, value);
    }
    const plan = fields.get('plan');
    const limit = fields.get('limit');
    if (!plan || !limit) return '';
    const current = fields.get('current');
    const wanted = current ? `, serían ${current}` : '';
    return ` (plan ${plan}: admite hasta ${limit}${wanted})`;
  }

  /**
   * GoTrue's own failures. The two the panel can act on are the ones it already
   * knows by heart: "ese correo ya está registrado" (the alias is taken by an
   * account outside this business, which is a fact the owner can change) and
   * anything else, which is ours.
   *
   * No message from Auth is forwarded: it is English prose from a third party
   * and may name addresses.
   */
  private mapAuthAdminError(message: string | undefined): Error {
    const text = (message ?? '').toLowerCase();
    if (
      text.includes('already') ||
      text.includes('been taken') ||
      text.includes('registered') ||
      text.includes('duplicate')
    ) {
      return new ConflictException('Ese alias ya está en uso.');
    }
    if (text.includes('not found') || text.includes('no user')) {
      return new NotFoundException('La cuenta de esa persona ya no existe.');
    }
    return new InternalServerErrorException(
      'No se pudo completar la operación con el inicio de sesión.',
    );
  }

  private asError(error: unknown): Error {
    if (error instanceof Error) return error;
    return new InternalServerErrorException(
      'Error inesperado al guardar el acceso.',
    );
  }
}
