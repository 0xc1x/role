import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import type { AnnouncementListQuery } from '@0c1x/role-commons';
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { escapeLike } from '../../common/utils/like';
import type { Env } from '../../config/env.schema';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import { announcements } from '../../database/schema';

/** Fila tal como está en Postgres (los timestamps son `Date`). */
export type AnnouncementRow = typeof announcements.$inferSelect;

/** Payload de inserción para Drizzle. */
export type AnnouncementInsert = typeof announcements.$inferInsert;

/**
 * Actualización parcial. `id` y `created_at` no están y no pueden entrar: un
 * PATCH que no los menciona no los toca. `user_ids` y `business_ids` SÍ están,
 * porque cambiar la audiencia dirigida es una edición legítima, y es la única
 * forma de que un `specific` cambie de destinatario.
 */
export type AnnouncementUpdate = Partial<
  Pick<
    AnnouncementInsert,
    | 'title'
    | 'body'
    | 'severity'
    | 'audience_kind'
    | 'user_ids'
    | 'business_ids'
    | 'priority'
    | 'active'
    | 'start_at'
    | 'end_at'
  >
>;

/**
 * El filtro del listado es el contrato, no una copia. Escribir `severity?:
 * 'info' | 'required'` acá sería la CUARTA copia de ese vocabulario —la
 * migración con su CHECK, el schema de drizzle, commons y esta— y las cuatro
 * pueden divergir sin que nada se entere: el síntoma sería un 500 por un valor
 * que el panel mandó y la base no acepta. El patrón es el de
 * `offers.repository.ts`, que toma `ListOffersQuery` tal cual.
 */
export type ListAnnouncementsFilter = AnnouncementListQuery;

export type ListAnnouncementsResult = {
  rows: AnnouncementRow[];
  total: number;
};

/**
 * DB executor: cliente raíz o una transacción abierta. Los call sites pasan `tx`
 * dentro de `transaction()` para que lectura y escritura compartan conexión.
 */
export type DbExecutor = Database;

/**
 * Fila del read path PÚBLICO, con la forma que devuelve PostgREST: snake_case y
 * timestamps ISO en string, no `Date`.
 *
 * Deliberadamente NO declara `user_ids` ni `business_ids`. Son el camino de
 * escritura y el mismo aviso lo pueden leer muchísimos dispositivos a la vez, así
 * que mandarlos le regalaría a cada uno la lista de todos los demás a los que el
 * operador apuntó. El tipo lo dice tanto como la selección de columnas: son dos
 * afirmaciones del mismo hecho, y una sola podría mentir.
 */
export type EligibleAnnouncementRow = {
  id: string;
  title: string;
  body: string;
  severity: string;
  audience_kind: string;
  priority: number;
  active: boolean;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Una fila de `public.business_ownership` como la devuelve PostgREST.
 *
 * La tabla tiene `PRIMARY KEY (business_id)` —un dueño por negocio—, y el tipo
 * NO declara esa cardinalidad: la resolución suma todos los `owner_id` que
 * vuelven, así que el día que la co-propiedad cambie la clave, el código ya
 * hace lo correcto sin que haya que tocarlo.
 */
export type BusinessOwnershipRow = {
  business_id: string;
  owner_id: string;
};

/**
 * Columnas de la resolución de dueños: los dos ids y nada más. `owner_id` es
 * la columna que salió de `businesses` justamente para esto —está en
 * `business_ownership` y no en la tabla pública porque `anon` puede leer el
 * catálogo—, así que la lectura se hace por esta tabla y no por un join.
 */
const OWNERSHIP_COLUMNS = 'business_id, owner_id';

/** Un objeto cualquiera, para poder mirar sus claves sin castear. */
function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

/**
 * Una fila de `business_ownership` con los dos ids en string.
 *
 * Existe porque el cliente de Supabase va sin tipo genérico de `Database` y la
 * cadena `from().select()` devuelve `any`. Acá `any` no pasa: una fila a la que
 * le falte cualquiera de los dos ids se descarta, y el resultado es que el
 * negocio se ve SIN DUEÑO —que es exactamente lo que es— y el service rechaza
 * la publicación nombrándolo. Es preferible a creerse un `any`: un `owner_id`
 * inventado mete a una persona en la audiencia de un aviso, y una audiencia con
 * un id de más es una fuga.
 */
function esFilaDeOwnership(fila: unknown): fila is BusinessOwnershipRow {
  return (
    esObjeto(fila) &&
    typeof fila.business_id === 'string' &&
    typeof fila.owner_id === 'string'
  );
}

/**
 * Columnas del read path público. Explícitas y sin las dos listas de audiencia:
 * que no se PIDAN es la garantía de que no salen. La validación del contrato
 * también las descartaría si aparecieran, pero depender de eso es pedirle al
 * zod que tapone un `select *` que alguien va a escribir algún día.
 */
const PUBLIC_COLUMNS =
  'id, title, body, severity, audience_kind, priority, active, start_at, end_at, created_at, updated_at';

@Injectable()
export class AnnouncementsRepository {
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey: string;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    config: ConfigService<Env, true>,
  ) {
    this.supabaseUrl = config.get('SUPABASE_URL', { infer: true });
    this.supabaseAnonKey = config.get('SUPABASE_ANON_KEY', { infer: true });
  }

  /**
   * Corre trabajo dentro de una transacción. Preferible a exponer el cliente.
   */
  transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  /**
   * Las filas que le tocan a quien pregunta, y solo esas.
   *
   * NO reimplementa la elegibilidad: no hay `eq(active, true)`, ni comparación
   * de `start_at`/`end_at`, ni chequeo de `audience_kind`. Eso es exactamente lo
   * que hace `Anyone reads the announcements they are eligible for`, y está en
   * la policy para que el móvil, el landing —que leen Supabase directo— y este
   * endpoint den la misma respuesta. Si el filtro estuviera también acá, la
   * regla quedaría escrita dos veces y solo se corregiría la que nadie mira.
   *
   * Por eso lee por PostgREST y no por drizzle: la conexión de la API es
   * `service_role`, que tiene BYPASSRLS y vería todas las filas, incluidas las
   * dirigidas a otra persona. Con la sesión del que pregunta, decide la policy.
   *
   * El `order` sí es de acá —es el orden de presentación, no una condición de
   * existencia— y el paginado no viene: el read path público devuelve la lista
   * entera, que son las filas que RLS ya dejó pasar.
   *
   * El cliente se arma por llamada —ver `supabaseDe`— porque la cabecera
   * `Authorization` cambia con el token.
   */
  async listEligible(token: string | null): Promise<EligibleAnnouncementRow[]> {
    const supabase = this.supabaseDe(token);

    const { data, error } = await supabase
      .from('announcements')
      .select(PUBLIC_COLUMNS)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      // Se propaga en vez de devolver `[]`: una caída de Postgres y "no tenés
      // avisos" tienen que ser distinguibles. El service la convierte en 500 con
      // log; el que devuelve lista vacía aquí es el que hides el incidente.
      throw new Error(`No se pudieron leer los anuncios: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Los dueños de los negocios indicados, LEÍDOS COMO QUIEN PUBLICA.
   *
   * Es la consulta que resuelve `business_ids` a `user_ids` al publicar. Va por
   * PostgREST y con el token del operador, y no por drizzle, por la misma razón
   * que `listEligible`: la conexión de la API es `service_role` —BYPASSRLS— y
   * resolvería los dueños sin que ninguna policy opinara. Con la sesión del
   * operador, `business_ownership` decide, y la lectura queda registrada como lo
   * que ese operador puede ver.
   *
   * No choca con ninguna policy: `authenticated` tiene SELECT sobre la tabla y
   * `Admins can view all business ownership` —`my_role() = 'admin'`— deja pasar
   * las filas que el guard de `@Roles('admin')` ya le garantiza a esta request.
   * `anon` no tiene ni grant ni policy, y por eso el token acá no es opcional:
   * resolver por `anon` no puede devolver nada.
   *
   * Devuelve FILAS y no un `Map` de negocio → dueño: la resolución suma todos
   * los `owner_id` que vuelven, así que un negocio con más de un dueño los
   * agrega a todos en vez de pisar uno. Además devuelve el `business_id`, que es
   * lo que permite notar el negocio al que no se le encontró dueño.
   */
  async ownerIdsForBusinesses(
    token: string,
    businessIds: readonly string[],
  ): Promise<BusinessOwnershipRow[]> {
    const supabase = this.supabaseDe(token);

    const { data, error } = await supabase
      .from('business_ownership')
      .select(OWNERSHIP_COLUMNS)
      .in('business_id', businessIds);

    if (error) {
      // Se propaga, igual que en `listEligible`: acá además el service NO puede
      // seguir sin la respuesta, porque sin las filas todo negocio parece sin
      // dueño y el operador recibiría un rechazo que no es su culpa.
      throw new Error(
        `No se pudieron leer los dueños de los negocios: ${error.message}`,
      );
    }

    return (data ?? []).filter(esFilaDeOwnership);
  }

  /**
   * El cliente de PostgREST, ARMADO POR LLAMADA.
   *
   * La cabecera `Authorization` cambia con el token, así que un cliente
   * compartido con la sesión del primero que preguntó sería la peor de las dos
   * formas de equivocarse acá: el segundo pediría los anuncios del primero.
   *
   * La clave es SIEMPRE la anon y el token viaja en el header. Es lo que
   * convierte la request en `authenticated` para PostgREST y lo que hace que
   * sea la policy la que decida, en vez del código. Al revés —el token como
   * key— la identidad sería la del cliente fijo y no la de quien pergunta.
   */
  private supabaseDe(token: string | null) {
    return createClient(this.supabaseUrl, this.supabaseAnonKey, {
      // Sin token no hay `auth.uid()` y la policy resuelve a anónimo, que ve
      // los `all` y los `consumers` de `info`: lo que el landing, que no tiene
      // sesión, necesita. `required` no llega porque el fragmento
      // `severity = 'info' or auth.uid() is not null` lo saca.
      global: token ? { headers: { Authorization: token } } : {},
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async list(
    filter: ListAnnouncementsFilter,
  ): Promise<ListAnnouncementsResult> {
    const offset = (filter.page - 1) * filter.limit;
    const filters: SQL[] = [];

    if (filter.active !== undefined) {
      filters.push(eq(announcements.active, filter.active));
    }
    if (filter.severity !== undefined) {
      filters.push(eq(announcements.severity, filter.severity));
    }
    if (filter.search) {
      filters.push(
        or(
          ilike(announcements.title, `%${escapeLike(filter.search)}%`),
          ilike(announcements.body, `%${escapeLike(filter.search)}%`),
        )!,
      );
    }

    const where = filters.length > 0 ? and(...filters) : undefined;

    const [totalRow] = await this.db
      .select({ count: count() })
      .from(announcements)
      .where(where);

    const rows = await this.db
      .select()
      .from(announcements)
      .where(where)
      .orderBy(desc(announcements.priority), desc(announcements.created_at))
      .limit(filter.limit)
      .offset(offset);

    return { rows, total: totalRow?.count ?? 0 };
  }

  async findById(id: string): Promise<AnnouncementRow | null> {
    const [row] = await this.db
      .select()
      .from(announcements)
      .where(eq(announcements.id, id))
      .limit(1);
    return row ?? null;
  }

  async insert(
    executor: DbExecutor,
    values: AnnouncementInsert,
  ): Promise<AnnouncementRow> {
    const [row] = await executor
      .insert(announcements)
      .values(values)
      .returning();
    if (!row) {
      throw new Error('Failed to insert announcement');
    }
    return row;
  }

  async update(
    executor: DbExecutor,
    id: string,
    values: AnnouncementUpdate,
  ): Promise<AnnouncementRow | null> {
    const [row] = await executor
      .update(announcements)
      .set({ ...values, updated_at: new Date() })
      .where(eq(announcements.id, id))
      .returning();
    return row ?? null;
  }

  /**
   * Da de baja un aviso: `active = false`.
   *
   * NO hay borrado físico ni `deleted_at` en esta tabla, y no los hay a
   * propósito: la baja tiene que ser reversible desde el panel, y `active` es la
   * columna que la policy ya mira. Desactivar dos veces no es error —la segunda
   * devuelve la misma fila—, porque este DELETE y el PATCH de `active` dicen lo
   * mismo.
   */
  async deactivate(
    executor: DbExecutor,
    id: string,
  ): Promise<AnnouncementRow | null> {
    const [row] = await executor
      .update(announcements)
      .set({ active: false, updated_at: new Date() })
      .where(eq(announcements.id, id))
      .returning();
    return row ?? null;
  }

  /*
   * NO hay método de acknowledge acá, y es a propósito.
   *
   * La tabla `announcement_acknowledgements` se escribe desde el cliente, por
   * PostgREST y con la sesión de quien entendió el aviso, y la policy lo ata con
   * `with check (user_id = auth.uid())`. La API no publica avisos con esa vía
   * justamente porque su conexión tiene BYPASSRLS: un insert acá sacaría el ack
   * de la base y lo dejaría en el código.
   *
   * El espejo de la tabla vive en `database/schema/announcements.ts` igual, porque
   * el espejo tiene que parecerse a la base —de eso vive `mirror-fidelity`— y la
   * tabla existe, con sus dos FKs, para que los specs puedan correr contra ella.
   */
}
