import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { escapeLike } from '../../common/utils/like';
import type { Env } from '../../config/env.schema';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import {
  announcementAcknowledgements,
  announcements,
} from '../../database/schema';

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

export type ListAnnouncementsFilter = {
  page: number;
  limit: number;
  search?: string;
  severity?: 'info' | 'required';
  active?: boolean;
};

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
   * El cliente se arma por llamada porque la cabecera `Authorization` cambia con
   * el token: un cliente compartido con la sesión del primero que preguntó sería
   * la peor de las dos formas de equivocarse acá.
   */
  async listEligible(token: string | null): Promise<EligibleAnnouncementRow[]> {
    const supabase = createClient(this.supabaseUrl, this.supabaseAnonKey, {
      // Sin token no hay `auth.uid()` y la policy resuelve a anónimo, que ve
      // los `all` y los `consumers` de `info`: lo que el landing, que no tiene
      // sesión, necesita. `required` no llega porque el fragmento
      // `severity = 'info' or auth.uid() is not null` lo saca.
      global: token ? { headers: { Authorization: token } } : {},
      auth: { autoRefreshToken: false, persistSession: false },
    });

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

  /**
   * Registra que un usuario entendió un aviso.
   *
   * Idempotente por construcción: `ON CONFLICT DO NOTHING` sobre la PK
   * compuesta. Es la única forma de reintentar sin duplicar, y también la única
   * que se puede permitir acá: un `ON CONFLICT DO UPDATE` necesitaría una policy
   * de UPDATE sobre los acks, y no la hay —no hay forma de des-acknowledgear—.
   * Por eso esto es un INSERT que ignora el conflicto, y no un upsert que pisa.
   */
  async acknowledge(values: {
    announcement_id: string;
    user_id: string;
  }): Promise<void> {
    await this.db
      .insert(announcementAcknowledgements)
      .values(values)
      .onConflictDoNothing();
  }
}
