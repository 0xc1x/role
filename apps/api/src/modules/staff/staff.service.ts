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
  type StaffSessionReason,
  type StaffSessionState,
  type UpdateBusinessMemberAliasDto,
  type UpdateBusinessMemberAliasResponseDto,
  type UpdateBusinessMemberDto,
} from '@0xc1x/role-commons';
import { safeErrorFields } from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { StaffMapper } from './staff.mapper';
import { StaffRepository, type BusinessMemberRow } from './staff.repository';
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

const ALIAS_CONSTRAINT = 'business_members_alias_key';
const ONE_OWNER_CONSTRAINT = 'business_members_one_owner_per_business';
const MEMBER_PER_BUSINESS_CONSTRAINT =
  'business_members_business_id_user_id_key';

/**
 * The reach of whoever is calling, resolved once per request.
 *
 * `locationIds` is the caller's OWN set of branches and it is empty for an
 * `owner`: an owner is not restricted by branches at all (`can_manage_location`
 * hands it the whole business), so representing its reach as "the set of
 * branches of the business" would be a fiction this module then has to remember
 * to special-case. Empty means "no restriction" and only `role` decides that.
 */
type StaffActor = {
  userId: string;
  businessId: string;
  role: BusinessMemberRole;
  locationIds: Set<string>;
};

/**
 * CONTAINMENT, NOT INTERSECTION. This is the whole reach rule of §8 in one line.
 *
 * A `manager` of A+B may touch an access whose branches are a SUBSET of {A, B}:
 * ∅, {A}, {B}, {A, B}. It may NOT touch an access scoped to {A, C} even though A
 * is inside its reach, because C is not, and that access can *write* C. Reading
 * it as "shares a branch" would hand every manager of a chain a way to widen a
 * colleague's reach by one overlapping branch.
 *
 * The empty scope is a subset of everything and that is deliberate, not a hole: a
 * member with no branches touches nothing anywhere (§5.1), so there is nothing
 * for the caller to reach through it.
 */
function scopeIsContained(
  reach: ReadonlySet<string>,
  scope: readonly string[],
): boolean {
  return scope.every((locationId) => reach.has(locationId));
}

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
 * The arithmetic of `business_member_session_expires_at`, in TypeScript.
 *
 * `null` means "no expiry date exists", and that covers the two cases the §5.2
 * panel has to tell apart: TTL off (0, the "equipo propio" mode) and never
 * stamped. The reason is computed separately for exactly that reason.
 */
function sessionExpiresAt(
  row: Pick<BusinessMemberRow, 'session_ttl_hours' | 'last_authenticated_at'>,
): Date | null {
  if (row.session_ttl_hours <= 0) return null;
  if (!row.last_authenticated_at) return null;
  return new Date(
    row.last_authenticated_at.getTime() + row.session_ttl_hours * 3_600_000,
  );
}

/**
 * `business_member_session_state`'s reason, for the two cases the gate needs.
 *
 * The order is the SQL's and it is not cosmetic: a TTL with no stamp is "your
 * session expired" as far as authorization is concerned (`can_manage_location`
 * returns false for it), and calling it "expired" would point the panel at the
 * wrong message. `session_never_stamped` exists to say "sign in again".
 */
function sessionReason(
  row: Pick<BusinessMemberRow, 'session_ttl_hours' | 'last_authenticated_at'>,
  now: Date,
): StaffSessionReason {
  if (row.session_ttl_hours > 0 && !row.last_authenticated_at) {
    return 'session_never_stamped';
  }
  const expiresAt = sessionExpiresAt(row);
  if (expiresAt && expiresAt < now) return 'session_expired';
  return 'ok';
}

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

    return members
      .filter((member) => this.reaches(actor, member.row, member.locationIds))
      .map((member) => StaffMapper.toMemberDto(member.row, member.locationIds));
  }

  /**
   * `POST /staff/session`: stamps `last_authenticated_at` and explains the state.
   *
   * It is the one method that does not refuse, and that is the feature: the §5.2
   * panel has to be able to tell "you were paused" from "I don't know you", so the
   * answer to a membership that cannot operate is a `StaffSessionState`, not a
   * 403. Refusing here would leave the panel with a generic error on the exact
   * screen whose job is to explain the exit.
   */
  async stampSession(
    user: AuthUser,
    businessId: string,
  ): Promise<StaffSessionState> {
    const row = await this.repository.findMemberByUser(businessId, user.id);

    if (!row) {
      return {
        role: null,
        location_ids: [],
        expires_at: null,
        reason: 'no_membership',
        business_ids: [],
      };
    }

    if (row.status !== 'active') {
      return {
        role: null,
        location_ids: [],
        expires_at: null,
        reason: 'disabled',
        business_ids: [],
      };
    }

    const stampedAt = new Date();
    const stamped = await this.repository.stampSession(
      businessId,
      user.id,
      stampedAt,
    );
    const locationIds = await this.repository.locationIdsOfMember(row.id);

    this.logger.log({
      event: 'staff_session_stamped',
      businessId,
      memberId: row.id,
      role: row.role,
    });

    // A row that was not stamped (it was given away between the two reads) is
    // reported as the session it is, not as an error: the panel asked "may I
    // operate", and "no membership" is a true answer.
    const state = stamped ?? row;

    return {
      role: state.role,
      location_ids: locationIds,
      expires_at: sessionExpiresAt(state)?.toISOString() ?? null,
      reason: sessionReason(state, stampedAt),
      business_ids: [businessId],
    };
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
   */
  async create(
    user: AuthUser,
    businessId: string,
    body: CreateBusinessMemberDto,
  ): Promise<BusinessMemberDeliveryCardDto> {
    const actor = await this.requireActor(user, businessId);

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

    const locationIds = await this.resolveLocations(
      businessId,
      body.business_location_ids,
    );
    this.assertWithinReach(actor, locationIds);
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
      createdBy: actor.userId,
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
      throw new UnprocessableEntityException(
        'Un acceso no se promueve a dueño: la transferencia de propiedad no existe en esta versión.',
      );
    }

    let locationIds: string[] | undefined;
    if (body.business_location_ids !== undefined) {
      locationIds = await this.resolveLocations(
        businessId,
        body.business_location_ids,
      );
      this.assertWithinReach(actor, locationIds);
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

    const reason = sessionReason(row, new Date());
    if (reason === 'session_expired' || reason === 'session_never_stamped') {
      throw new ForbiddenException(
        'Tu sesión venció. Entra otra vez para seguir administrando el equipo.',
      );
    }

    return {
      userId: user.id,
      businessId,
      role: row.role,
      locationIds: new Set(await this.repository.locationIdsOfMember(row.id)),
    };
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
   */
  private reaches(
    actor: StaffActor,
    member: Pick<BusinessMemberRow, 'role'>,
    locationIds: readonly string[],
  ): boolean {
    if (actor.role === 'owner') return true;
    if (member.role === 'owner') return false;
    return scopeIsContained(actor.locationIds, locationIds);
  }

  private async assertCanReachMember(
    actor: StaffActor,
    member: BusinessMemberRow,
  ): Promise<void> {
    const locationIds = await this.repository.locationIdsOfMember(member.id);
    if (this.reaches(actor, member, locationIds)) return;

    // Only a manager arrives here: `reaches` is unconditionally true for an
    // owner, so there is no "you do not administer this" message to write.
    throw new ForbiddenException(
      'Solo administras los accesos cuyas sucursales están dentro de las tuyas.',
    );
  }

  /** The same rule, applied to a reach that is ABOUT TO BE WRITTEN. */
  private assertWithinReach(
    actor: StaffActor,
    locationIds: readonly string[],
  ): void {
    if (actor.role === 'owner') return;
    if (scopeIsContained(actor.locationIds, locationIds)) return;

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
      const numbers = this.describePlanLimit(postgresError.detail);
      return new UnprocessableEntityException({
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: `${postgresError.message ?? 'El plan no admite otro acceso.'}${numbers}`,
      });
    }

    if (postgresError.code === PG_OWNER_UNTOUCHABLE) {
      // `R0002`: the owner is untouchable and it is NOT the plan's fault. The
      // message is the trigger's own —a fixed string from our migration, and the
      // one that names the way out ("degradalo a manager primero").
      return new UnprocessableEntityException(
        postgresError.message ??
          'El dueño del negocio no se puede desactivar ni dar de baja.',
      );
    }

    return this.asError(error);
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
