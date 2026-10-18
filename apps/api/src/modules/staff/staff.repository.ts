import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import {
  StaffSessionStateSchema,
  type StaffSessionState,
} from '@0xc1x/role-commons';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import {
  businessLocations,
  businessMemberLocations,
  businessMembers,
  businesses,
} from '../../database/schema';

/**
 * DB executor: root client or an open transaction.
 *
 * Call sites pass `tx` inside `transaction()` so the two halves of a write —the
 * membership row and its scope rows— share one connection and one commit.
 */
export type StaffDbExecutor = Database;

export type BusinessMemberRow = typeof businessMembers.$inferSelect;
export type BusinessMemberInsert = typeof businessMembers.$inferInsert;
export type BusinessMemberScopeRow =
  typeof businessMemberLocations.$inferSelect;

/**
 * Only the columns an access may be written with.
 *
 * `id`, `business_id`, `user_id` and `created_at` are absent on purpose: they
 * are identity or provenance. A write that could move a membership to another
 * person or another business is a second door into `business_members`, which
 * has no write policy at all (§6.3) and whose only writer is this API.
 *
 * `label` IS here even though none of the nine routes of §8 renames an access:
 * the field is `NOT NULL` and the row has to be insertable, and a create-only
 * field in a "patch" type would be a lie about what the type is for.
 */
export type BusinessMemberPatch = Partial<
  Pick<
    BusinessMemberInsert,
    | 'label'
    | 'alias'
    | 'role'
    | 'status'
    | 'session_ttl_hours'
    | 'last_authenticated_at'
    | 'deleted_at'
  >
>;

/** A live membership row plus the location ids that make up its reach. */
export type MemberWithScope = {
  row: BusinessMemberRow;
  locationIds: string[];
};

/**
 * Every read of a membership filters `deleted_at is null`.
 *
 * §6.3 lists who has to: the helpers, the policies, the limit trigger and this
 * API's list. A row with `deleted_at` grants nothing by any path — not even if
 * its `auth.users` were still alive, which is precisely why it exists — so a
 * read that skipped the predicate would hand the panel a dead access as if it
 * were live.
 *
 * The one thing that reads a row with `deleted_at` is nobody: the burned-alias
 * guarantee is not a query here, it is the index that has no partial predicate
 * by design (`business_members_alias_key`, `business-members.ts`), and it shows
 * up as a `23505 business_members_alias_key` that `StaffService` maps to a 409.
 */
function liveMember(businessId: string, memberId: string): SQL {
  return and(
    eq(businessMembers.business_id, businessId),
    eq(businessMembers.id, memberId),
    isNull(businessMembers.deleted_at),
  )!;
}

@Injectable()
export class StaffRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  transaction<T>(fn: (tx: StaffDbExecutor) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  /**
   * The business, for the slug the default alias hangs off (§3.1).
   *
   * Only two columns because only two are needed: proving the business exists
   * (a 404 rather than a membership in a business that is not there) and
   * composing `{código}@{slug}.role.ec`. Everything else about the business is
   * `BusinessesRepository`'s business.
   */
  async findBusiness(
    businessId: string,
  ): Promise<{ id: string; slug: string } | null> {
    const [row] = await this.db
      .select({ id: businesses.id, slug: businesses.slug })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);
    return row ?? null;
  }

  /**
   * The caller's own membership row, whatever its `status`.
   *
   * `status` is NOT filtered here on purpose. The service has to tell three
   * things apart —"no membership", "you were paused", "ok"— and a query that
   * pre-filtered `status = 'active'` would collapse the first two into a
   * missing row, which is exactly the difference the §5.2 panel cares about:
   * `no_membership` says "I don't know you" and `disabled` says "they took
   * your access away". The two are separate rows of `StaffSessionStateSchema`
   * for that reason.
   */
  async findMemberByUser(
    businessId: string,
    userId: string,
    executor: StaffDbExecutor = this.db,
  ): Promise<BusinessMemberRow | null> {
    const [row] = await executor
      .select()
      .from(businessMembers)
      .where(
        and(
          eq(businessMembers.business_id, businessId),
          eq(businessMembers.user_id, userId),
          isNull(businessMembers.deleted_at),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** One live access of this business, or `null`. */
  async findMemberById(
    businessId: string,
    memberId: string,
    executor: StaffDbExecutor = this.db,
  ): Promise<BusinessMemberRow | null> {
    const [row] = await executor
      .select()
      .from(businessMembers)
      .where(liveMember(businessId, memberId))
      .limit(1);
    return row ?? null;
  }

  /**
   * Every live access of the business with its reach attached.
   *
   * TWO queries and the containment rule runs in TypeScript, on purpose. The
   * rule is "the target's branches are a SUBSET of the caller's", and a
   * subset cannot be asked of a join without a `not exists` over a second copy
   * of the scope table: the comparison lives in the service because that is
   * where the test that tells subset apart from intersection lives, and a
   * repository that answered "yes" would make that test unable to see the
   * difference at all.
   *
   * The cost is two round-trips over a table whose ceiling is the plan's member
   * limit, which is 20 for `pro` and unbounded only for `pro_plus`.
   */
  async listMembersWithScope(businessId: string): Promise<MemberWithScope[]> {
    const rows = await this.db
      .select()
      .from(businessMembers)
      .where(
        and(
          eq(businessMembers.business_id, businessId),
          isNull(businessMembers.deleted_at),
        ),
      )
      .orderBy(businessMembers.created_at);

    if (rows.length === 0) return [];

    const scopes = await this.db
      .select({
        member_id: businessMemberLocations.member_id,
        location_id: businessMemberLocations.location_id,
      })
      .from(businessMemberLocations)
      .innerJoin(
        businessMembers,
        eq(businessMembers.id, businessMemberLocations.member_id),
      )
      .where(
        and(
          eq(businessMembers.business_id, businessId),
          isNull(businessMembers.deleted_at),
          isNull(businessMemberLocations.deleted_at),
        ),
      );

    const byMember = new Map<string, string[]>();
    for (const scope of scopes) {
      const bucket = byMember.get(scope.member_id);
      if (bucket) bucket.push(scope.location_id);
      else byMember.set(scope.member_id, [scope.location_id]);
    }

    return rows.map((row) => ({
      row,
      locationIds: byMember.get(row.id) ?? [],
    }));
  }

  /** The live branch ids of one member. */
  async locationIdsOfMember(
    memberId: string,
    executor: StaffDbExecutor = this.db,
  ): Promise<string[]> {
    const rows = await executor
      .select({ location_id: businessMemberLocations.location_id })
      .from(businessMemberLocations)
      .where(
        and(
          eq(businessMemberLocations.member_id, memberId),
          isNull(businessMemberLocations.deleted_at),
        ),
      );
    return rows.map((row) => row.location_id);
  }

  /**
   * Which of `ids` are branches of THIS business.
   *
   * Returns the intersection instead of a boolean on purpose: the caller needs
   * to tell the owner WHICH branch was refused, and "una sucursal no es de este
   * negocio" is a 422 about the request while "no tienes esa sucursal" is a 403
   * about the caller. Collapsing both into one boolean would make the second
   * one unexplainable.
   *
   * The check exists because `business_member_locations.location_id` has no
   * composite FK tying the branch to the member's business (§5.1): the row is
   * representable, and this API writes with `service_role`, where RLS does not
   * apply.
   */
  async findLocationIdsInBusiness(
    businessId: string,
    ids: readonly string[],
  ): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ id: businessLocations.id })
      .from(businessLocations)
      .where(
        and(
          eq(businessLocations.business_id, businessId),
          inArray(businessLocations.id, [...ids]),
        ),
      );
    return rows.map((row) => row.id);
  }

  /**
   * The membership insert.
   *
   * `on conflict do nothing` on the member/scope primary key is NOT here: an
   * access that is already there is a conflict the owner needs to hear about
   * (`business_members_business_id_user_id_key` → 409), not a silent no-op. The
   * scope rows DO get an upsert, because their key is `(member_id, location_id)`
   * and a branch that was once in the reach is a row that already exists with
   * `deleted_at` set — re-adding it is a resurrection, not a duplicate.
   */
  async insertMember(
    executor: StaffDbExecutor,
    values: BusinessMemberInsert,
  ): Promise<BusinessMemberRow> {
    const [row] = await executor
      .insert(businessMembers)
      .values(values)
      .returning();
    if (!row) {
      throw new Error('business_members insert returned no row');
    }
    return row;
  }

  /**
   * Replaces a member's reach: soft-deletes what is there, upserts the new set.
   *
   * Two statements instead of a `not in (…)` diff, and the empty case is the
   * reason: `notInArray(col, [])` is not "match everything" in every version of
   * the query builder, and an access whose reach becomes empty —a `staff` with
   * no branches, which §5.1 makes representable and harmless— is exactly the
   * input that decides it.
   */
  async setScope(
    executor: StaffDbExecutor,
    memberId: string,
    locationIds: readonly string[],
  ): Promise<void> {
    const now = new Date();
    await executor
      .update(businessMemberLocations)
      .set({ deleted_at: now, updated_at: now })
      .where(
        and(
          eq(businessMemberLocations.member_id, memberId),
          isNull(businessMemberLocations.deleted_at),
        ),
      );

    if (locationIds.length === 0) return;

    await executor
      .insert(businessMemberLocations)
      .values(
        [...new Set(locationIds)].map((locationId) => ({
          member_id: memberId,
          location_id: locationId,
        })),
      )
      .onConflictDoUpdate({
        target: [
          businessMemberLocations.member_id,
          businessMemberLocations.location_id,
        ],
        set: { deleted_at: null, updated_at: now },
      });
  }

  /**
   * A patch on a live access.
   *
   * `updated_at` moves because no trigger maintains it: the column is written by
   * hand everywhere in this repo, and a row whose "last changed" is its creation
   * time is a line in the panel that lies.
   *
   * The WHERE carries `business_id` as well as the id: the service gates on the
   * path's business and an UPDATE with no matching row is SILENT —no error, zero
   * rows— so a member id from another business would otherwise be a 200 that
   * changed nothing.
   *
   * The executor is optional and LAST (`tips.repository.ts` does the same) because
   * a single-column patch has nothing to be atomic with, while the two writes of
   * `create` and `remove` do and take theirs first.
   */
  async updateMember(
    businessId: string,
    memberId: string,
    values: BusinessMemberPatch,
    executor: StaffDbExecutor = this.db,
  ): Promise<BusinessMemberRow | null> {
    const [row] = await executor
      .update(businessMembers)
      .set({ ...values, updated_at: new Date() })
      .where(liveMember(businessId, memberId))
      .returning();
    return row ?? null;
  }

  /** Soft delete: the row stays, the alias stays burned (§8). */
  async softDeleteMember(
    executor: StaffDbExecutor,
    businessId: string,
    memberId: string,
  ): Promise<BusinessMemberRow | null> {
    const [row] = await executor
      .update(businessMembers)
      .set({ deleted_at: new Date(), updated_at: new Date() })
      .where(liveMember(businessId, memberId))
      .returning();
    return row ?? null;
  }

  /**
   * `public.business_member_session_state(p_business_id)`, AS THE CALLER.
   *
   * ─── `null` NO ES «NINGUNO»: ES «PREguntÁLE» ─────────────────────────────────
   *
   * El argumento de la función es opcional y sin él hace algo que esta API no
   * puede replicar: recorre las membresías **activas** de quien pregunta y
   * devuelve `multiple_businesses` si hay más de una, `no_membership` si no hay
   * ninguna, y el estado de la única si hay exactamente una. Es la tabla del
   * §5.2, y la razón por la que el argumento existe siendo opcional es que el
   * dueño real tiene varios negocios —en producción, seis— y elegir la fila más
   * antigua devuelve el negocio equivocado sin avisar.
   *
   * Por eso el `null` produce un `::uuid` con la llamada SIN argumento, y no un
   * `business_member_session_state(null::uuid)`: las dos se evalúan igual en
   * plpgsql, pero la segunda dice «buscá esta membresía que no existe» en vez de
   * «decime cuáles tenés», y el código tiene que poder leerse.
   *
   * ─── POR QUÉ SE PREGUNTA Y NO SE CALCULA ────────────────────────────────────
   *
   * El §5.2 quiere que la que autoriza y la que explica nunca se contradigan, y
   * el Plan 1 pagó dos rondas de review por ello: `can_manage_location`,
   * `business_member_session_valid` y `business_member_session_state` tenían cada
   * una su copia de la aritmética del TTL, y hoy las tres llaman a
   * `business_member_session_expires_at`. Esta es la CUARTA copia si alguien la
   * escribe en TypeScript, y es la única de las cuatro que el guard de catálogo no
   * puede ver: aquel test lee `pg_proc.prosrc` y no sabe que existe este archivo.
   *
   * Por eso el `expires_at` de la respuesta sale de acá, de la misma cuenta que
   * aplica `can_manage_location`, y no de una línea de `.getTime() + ttl * 3_600_000`
   * al otro lado del cable. Un día que las dos se aparten, el panel muestra una
   * sesión viva que RLS dice muerta —o al revés— y nada se pone rojo.
   *
   * ─── CÓMO SE PONE LA IDENTIDAD DEL QUE LLAMA ───────────────────────────────
   *
   * La función es `security definer` y lee `auth.uid()`, que sale de
   * `request.jwt.claims`; esta API no tiene el JWT del usuario —`AuthUser` son tres
   * campos, ninguno es el token—, así que no hay PostgREST al que preguntarle. Lo
   * que hay es el id **ya verificado** por el guard, y eso se le declara a la base
   * con `set_config(..., true)` dentro de una transacción, que es exactamente lo
   * que hace PostgREST cuando traduce una llamada RPC.
   *
   * Los tres detalles que lo sostienen, y que no son estilo:
   *
   *  - `is_local = true` SIN la transacción se derramaría al pooler: la conexión
   *    vuelve al pool y el siguiente request hereda el `sub` de este. Por eso va
   *    dentro de `db.transaction`, donde el GUC muere con el commit o el rollback.
   *  - La transacción también es lo que hace que el *transaction pooler* (:6543)
   *    sea seguro aquí: la llamada entera cae en una sola conexión de servidor, así
   *    que el `set_config` y la llamada no pueden separarse.
   *  - NO se cambia el rol de la sesión a `authenticated`, y está medido por qué:
   *    `service_role` **no es miembro** de `authenticated` en este proyecto
   *    (`pg_auth_members`: sus miembros son `postgres` y `authenticator`), así que
   *    un `set local role authenticated` depende de un privilege del rol del pooler
   *    que nadie ha medido. Y no haría falta: la función es `security definer`,
   *    o sea que dentro de ella `current_user` es el dueño y las RLS no aplican; lo
   *    único que hace que la respuesta sea DEL que pregunta es el `auth.uid()` que
   *    acabamos de declarar, y `p_business_id` acota el resto. `service_role` sí
   *    tiene EXECUTE sobre la función
   *    (`has_function_privilege('service_role', …, 'execute')` = true), así que la
   *    llamada se hace tal cual, sin migración.
   *
   * ─── POR QUÉ ESTA SÍ Y LAS CUATRO AGREGADOS DE `business-owner-stats` NO ───
   *
   * Aquel archivo reconstruye cuatro agregados que también existen como funciones,
   * y explica por qué: son `security invoker` y dejan decidir al RLS del invocante,
   * que esta conexión no tiene porque es el rol `postgres` del pooler, dueño de las
   * tablas. El riesgo que venía ahí era devolver la facturación de un negocio a
   * quien tuviera el token. Esta función no tiene ese riesgo por una razón que se
   * puede decir en una frase: **la respuesta es sobre quien pregunta**, no sobre un
   * objetivo que la request pueda elegir.
   *
   * ─── LA RESPUESTA SE DEVUELVE TAL CUAL ─────────────────────────────────────
   *
   * TAMBIÉN `expires_at`: el `jsonb` de la función lleva el `timestamptz` como un
   * texto ISO con offset —medido en la base viva:
   * `{"expires_at": "2026-10-18T01:03:07.204914+00:00"}`— y el panel ya consume
   * EXACTAMENTE esa forma porque llama al RPC desde el cliente. Reconvertirla aquí
   * sería una segunda traducción de la misma fecha, que es la clase de copia que
   * este método existe para quitar.
   *
   * `StaffSessionStateSchema.parse` es el borde: si la base crece un séptimo
   * `reason`, el schema —que es la copia— es lo que está mal, y revienta aquí con
   * un 500 ruidoso en vez de dejar que un valor desconocido llegue al panel y se
   * pintee como otro.
   */
  async sessionStateAsCaller(
    businessId: string | null,
    userId: string,
  ): Promise<StaffSessionState> {
    const claims = JSON.stringify({ sub: userId, role: 'authenticated' });

    const [result] = await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('request.jwt.claims', ${claims}, true)`,
      );
      if (businessId === null) {
        return tx.execute(
          sql`select public.business_member_session_state()::text as session_state`,
        );
      }
      return tx.execute(
        sql`select public.business_member_session_state(${businessId}::uuid)::text as session_state`,
      );
    });

    // El `::text` y el `JSON.parse` de abajo son deliberados: el `jsonb` lo
    // entrega postgres.js como objeto ya parseado según el driver, y el tipo de
    // la fila depende de qué versión esté instalada. Un texto no depende.
    const rows = result as { session_state: string }[] | undefined;
    const raw = rows?.[0]?.session_state;
    if (typeof raw !== 'string') {
      // Una fila sin `session_state` no es un caso que la función pueda
      // producir: siempre devuelve un objeto. Es o un `execute` que no se
      // ejecutó o una firma que cambió, y las dos cosas se investigan.
      throw new Error(
        'business_member_session_state no devolvió una fila de jsonb legible',
      );
    }

    return StaffSessionStateSchema.parse(JSON.parse(raw));
  }

  /**
   * Stamps the session of the member that just signed in.
   *
   * `last_authenticated_at` is the ONLY column the §5.2 session promise needs
   * from the API, and the one `business_member_session_expires_at` turns into a
   * date. `updated_at` moves with it because the meaning of the row changed.
   */
  async stampSession(
    businessId: string,
    userId: string,
    at: Date,
    executor: StaffDbExecutor = this.db,
  ): Promise<BusinessMemberRow | null> {
    const [row] = await executor
      .update(businessMembers)
      .set({ last_authenticated_at: at, updated_at: at })
      .where(
        and(
          eq(businessMembers.business_id, businessId),
          eq(businessMembers.user_id, userId),
          isNull(businessMembers.deleted_at),
        ),
      )
      .returning();
    return row ?? null;
  }
}
