import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import type { BusinessMemberRole } from '@0xc1x/role-commons';
import { businessMembers } from './schema';
import type { Database } from './database.module';

/**
 * THE answer to «¿esto es mi negocio?», and it is a FACT, not a permission.
 *
 * ─── POR QUÉ ESTE MÓDULO Y NO TRES MÉTODOS DE REPOSITORIO ──────────────────────
 *
 * El predicado estaba escrito tres veces —`BusinessesRepository.isOwner`,
 * `OrdersRepository.isBusinessOwner` y `OffersRepository.isBusinessOwner`— y las
 * tres leían `business_ownership`, la tabla que Plan 1 dejó de usar. Cuando Plan 3
 * la dropee, hay que cambiar las tres, y una se va a quedar. Este módulo es el
 * motivo por el que la cuarta copia no aparece: la pregunta tiene una sola
 * respuesta, escrita una sola vez, en un archivo que no es de nadie más.
 *
 * Es el mismo argumento que sostiene `database/business-availability.ts`, y por
 * eso vive al lado: una condición de seguridad compartida entre repositorios de
 * módulos distintos no puede ser un método privado de uno de ellos.
 *
 * ─── QUÉ CONTESTA Y QUÉ NO ───────────────────────────────────────────────────
 *
 * `membershipRole` devuelve el ROL que tiene quien pregunta en ese negocio, o
 * `null` si no es miembro. No devuelve «¿puedo?». La diferencia es toda la
 * seguridad de la consolidación: un helper que contesta «¿puedo?» y recibe un
 * `requiredRole` queda más prolijo y abre el acceso de somebody sin que nadie
 * lo note. Acá cada llamador dice lo que exige, sobre el hecho:
 *
 *     const role = await memberships.roleOf(businessId, user.id);
 *     if (role !== 'owner') throw new ForbiddenException(...);
 *
 * ─── LO QUE UNA MEMBRESÍA TIENE QUE CUMPLIR PARA CONCEDER ALGO ──────────────
 *
 * Tres condiciones, y las tres están en la base de la fila viva:
 *
 *  1. `deleted_at is null`. Una fila dada de baja no concede acceso por ningún
 *     camino —no es que esté «desactivada», es que no es una membresía— y el
 *     §6.3 lista a este archivo entre los lectores que tienen que filtrarla.
 *  2. `status = 'active'`. Una membresía pausada es un negocio en el que no se
 *     puede actuar, y lo dice el mismo par de condiciones que usa
 *     `business_member_session_valid`.
 *  3. La sesión está dentro de la promesa del §5.2. ESTA es la que se explica
 *     abajo, porque es la única de las tres que no es una columna.
 *
 * ─── LA SESIÓN, Y POR QUÉ SE CALCULA EN SQL Y NO EN TYPESCRIPT ────────────────
 *
 * Esta API escribe con `service_role`, donde RLS no aplica: la frontera de datos
 * no le dice nada a un `update` de esta conexión. Por eso el permiso tiene que
 * preguntarse acá, y por eso la pregunta tiene que incluir la sesión —el §5.2
 * promete que una sesión vencida no opera, y esa promesa sólo es cierta si los
 * dos lados la aplican.
 *
 * La ARITMÉTICA no está escrita acá: la cuenta es
 * `public.business_member_session_expires_at`, la misma que usan
 * `can_manage_location`, `business_member_session_valid` y
 * `business_member_session_state`. Es una función `IMMUTABLE` de la base y este
 * módulo la llama; no la reimplementa. La ARITMÉTICA duplicada en TypeScript es
 * invisible para el guard de catálogo —que lee `pg_proc.prosrc`— y por eso el
 * módulo de `staff` dejó de calcularla y pregunta a la función.
 *
 * Lo que sí está escrito acá es la COMBINACIÓN de las dos mitades de «vencida»:
 * una sesión con TTL y sin sello es vencida por definición, y una con sello
 * vence cuando la fecha compartida ya pasó. Las dos mitades son las mismas que
 * lee `business_member_session_valid`; la diferencia es que esa función
 * pregunta «¿es válida la sesión DE QUIEN PREGUNTA?», y esta pregunta por una
 * persona explícita porque esta API ya tiene el id verificado por el guard y
 * no tiene el JWT del usuario.
 */
export type MembershipDbExecutor = Database;

/**
 * The session promise of §5.2, applied to a membership row.
 *
 * `session_ttl_hours = 0` es el modo «equipo propio» del §9.2: no hay
 * vencimiento, y por eso la fila no necesita sello. Los 16 dueños reales
 * nacieron con TTL 0 (`20261016022631`), así que para ellos esta condición no
 * denies nada —que es exactamente lo que la generación vieja de policies
 * concedía y lo que la nueva concede para un dueño con la sesión viva.
 *
 * El resto es la cuenta de la base: `last_authenticated_at + ttl horas`, y la
 * comparación con `now()`. La fecha la pone `business_member_session_expires_at`;
 * el `>=` es el `not (expires_at < now())` de `business_member_session_valid`,
 * escrito al revés para que el caso del TTL apagado no tenga que compararse con
 * `null`.
 */
function sessionInsidePromise(): SQL {
  return sql`(
    ${businessMembers.session_ttl_hours} = 0
    or (
      ${businessMembers.last_authenticated_at} is not null
      and public.business_member_session_expires_at(
            ${businessMembers.session_ttl_hours},
            ${businessMembers.last_authenticated_at}
          ) >= now()
    )
  )`;
}

/**
 * A membership that grants access RIGHT NOW.
 *
 * `user_id` va adentro porque todas las preguntas que se hacen con esto son
 * «esta persona en este negocio»; el que quiera preguntar por otra fila
 * escribe su propio `where`.
 */
export function liveMembership(userId: string): SQL {
  return and(
    eq(businessMembers.user_id, userId),
    isNull(businessMembers.deleted_at),
    eq(businessMembers.status, 'active'),
    sessionInsidePromise(),
  ) as SQL;
}

/**
 * The caller is the OWNER of the business, with a live membership.
 *
 * This is the condition that replaces `business_ownership.owner_id = caller` in
 * every surface that answered «is this my business?». It is owner-only, and it
 * stays owner-only: a `manager` or a `staff` is a member, not the owner, and the
 * callers that want `owner | manager` say so with their own condition over
 * {@link membershipRole}.
 */
export function ownerMembership(userId: string): SQL {
  return and(liveMembership(userId), eq(businessMembers.role, 'owner')) as SQL;
}

/**
 * THE fact: what role the caller has in this business right now.
 *
 * `null` means there is no membership that grants anything —no row, a row given
 * of low, a row paused, or a row whose session is outside the §5.2 promise. The
 * four are the same answer for a permission and different answers for a panel,
 * and this function is asked by permissions; the panel has
 * `business_member_session_state`, which tells them apart.
 */
export async function membershipRole(
  executor: MembershipDbExecutor,
  businessId: string,
  userId: string,
): Promise<BusinessMemberRole | null> {
  const [row] = await executor
    .select({ role: businessMembers.role })
    .from(businessMembers)
    .where(
      and(eq(businessMembers.business_id, businessId), liveMembership(userId)),
    )
    .limit(1);
  return row?.role ?? null;
}

/**
 * The businesses whose OWNER this caller is.
 *
 * The same list that `business_ownership` used to answer, read from the
 * membership model. It is a list of businesses, not a permission: it says which
 * ones the caller owns, and each caller that wants to ACT on one asks
 * {@link membershipRole} for that business.
 */
export async function ownedBusinessIds(
  executor: MembershipDbExecutor,
  userId: string,
): Promise<string[]> {
  const rows = await executor
    .select({ id: businessMembers.business_id })
    .from(businessMembers)
    .where(ownerMembership(userId));
  return rows.map((row) => row.id);
}
