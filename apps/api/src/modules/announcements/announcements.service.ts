import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  paginatedDataFromQuery,
  safeErrorFields,
  AnnouncementSchema,
  type AnnouncementDto,
  type AnnouncementListQuery,
  type CreateAnnouncementDto,
  type PaginatedAnnouncements,
  type UpdateAnnouncementDto,
} from '@0xc1x/role-commons';
import {
  AnnouncementsRepository,
  type AnnouncementRow,
  type BusinessOwnershipRow,
} from './announcements.repository';
import { AnnouncementMapper } from './mappers/announcements.mapper';

/**
 * Un `audience_kind = 'specific'` sin un solo id es un aviso que no ve nadie:
 * la policy exige `user_ids @> array[auth.uid()]`, y un arreglo vacío no
 * contiene el uid de nadie. Queda activo en el panel, pasa todos los CHECK, y
 * es un no-op silencioso.
 *
 * El contrato NO lo valida —es una regla del service, no del SSOT—, así que
 * este predicado es lo único que lo frena. Rechaza las dos formas en que el
 * aviso queda sin destino: la lista ausente y la lista vacía. `[]` no es "no lo
 * pidió", es una audiencia explícitamente vacía, y las dos dejan el aviso
 * muerto igual.
 */
const SPECIFIC_WITHOUT_TARGET =
  'Un aviso para audiencia específica necesita al menos un user_id o business_id';

/**
 * Un negocio sin dueño se RECHAZA, y el mensaje lo nombra.
 *
 * Es la decisión máscara de esta regla. La alternativa —publicar y dejar que la
 * expansión no agregue a nadie— produce el peor resultado posible: un aviso
 * `active = true` en el panel que nadie va a ver nunca, y un operador que no se
 * entera porque no hubo ningún error. Un rechazo se ve en el momento en que se
 * puede arreglar: ir a darle dueño al negocio.
 *
 * Se nombran los ids y no los nombres porque el nombre del negocio no está en
 * `business_ownership`: el service lee esa tabla, no el catálogo. Un id es
 * suficiente para ir a buscar el negocio, y un nombre inventado sería peor que
 * ninguno.
 */
const BUSINESS_WITHOUT_OWNER = (businessIds: readonly string[]) =>
  `No se puede publicar: estos negocios no tienen dueño asignado y el aviso no llegaría a nadie: ${businessIds.join(', ')}`;

/**
 * Unión sin repetir y en orden estable: primero lo que el operador eligió a mano,
 * después los dueños resueltos.
 *
 * El orden estable no es un detalle de estilo. `user_ids` es lo que queda
 * guardado, y una fila cuyo contenido depende del orden en que Postgres devolvió
 * `business_ownership` no se puede comparar entre dos escrituras ni leer en el
 * panel. El `Set` además evita el `uuid` repetido cuando el dueño de un negocio
 * también estaba en la lista de personas.
 */
function unionDeUserIds(
  elegidos: readonly string[],
  resueltos: readonly string[],
): string[] {
  return [...new Set([...elegidos, ...resueltos])];
}

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(private readonly repository: AnnouncementsRepository) {}

  /**
   * Los avisos que le tocan a quien pregunta.
   *
   * NO reimplementa la elegibilidad —ni la ventana, ni la audiencia, ni
   * `active`—, y no es una omisión: la regla está en la policy de Supabase y el
   * móvil y el landing leen directo. Lo único que hace acá es parsear lo que RLS
   * dejó pasar con el contrato, que además es lo que garantiza que
   * `user_ids`/`business_ids` no salgan en el cable.
   *
   * Devuelve la lista entera sin paginar: son los avisos activos en este
   * momento, no un histórico, y el paginado acá sería una segunda versión de la
   * decisión que en el móvil es "una consulta al abrir la app".
   */
  async listForAudience(token: string | null): Promise<AnnouncementDto[]> {
    let rows: Awaited<ReturnType<AnnouncementsRepository['listEligible']>>;
    try {
      rows = await this.repository.listEligible(token);
    } catch (err) {
      // No se devuelve `[]`: "no tenés avisos" y "Postgres no respondió" tienen
      // que ser distinguibles, o el banner del landing se come el incidente.
      this.logger.error({
        event: 'announcements_list_failed',
        ...safeErrorFields(err),
      });
      throw new InternalServerErrorException(
        'No se pudieron obtener los anuncios',
      );
    }

    const parsed = AnnouncementSchema.array().safeParse(rows);
    if (!parsed.success) {
      // La fila no tiene la forma del contrato. Es una deriva de la base, no una
      // falla del que pregunta, y por eso tampoco se devuelve una lista vacía.
      this.logger.error({
        event: 'announcements_list_shape_mismatch',
        issueCount: parsed.error.issues.length,
      });
      throw new InternalServerErrorException(
        'No se pudieron obtener los anuncios',
      );
    }

    return parsed.data;
  }

  /** Listado del panel: paginado y con los filtros de `AnnouncementListQuery`. */
  async listAdmin(
    query: AnnouncementListQuery,
  ): Promise<PaginatedAnnouncements> {
    let rows: AnnouncementRow[];
    let total: number;

    try {
      const result = await this.repository.list({
        page: query.page,
        limit: query.limit,
        search: query.search,
        severity: query.severity,
        active: query.active,
      });
      rows = result.rows;
      total = result.total;
    } catch (err) {
      this.logger.error({
        event: 'announcements_admin_list_failed',
        ...safeErrorFields(err),
      });
      throw new InternalServerErrorException(
        'No se pudieron obtener los anuncios',
      );
    }

    return paginatedDataFromQuery(
      rows.map((row) => AnnouncementMapper.toDto(row)),
      { page: query.page, limit: query.limit },
      total,
    );
  }

  /**
   * Publica un aviso.
   *
   * `token` es el JWT del operador, y se usa para RESOLVER los negocios
   * elegidos a sus dueños: la lectura va por PostgREST con su sesión, no por la
   * conexión `service_role` de la API. Es la misma razón por la que
   * `listForAudience` no lee por drizzle.
   */
  async create(
    body: CreateAnnouncementDto,
    token: string | null,
  ): Promise<AnnouncementDto> {
    // El predicado va sobre lo que el operador ESCOGIÓ, antes de resolver los
    // negocios a sus dueños. Elegir un negocio es una audiencia válida —la
    // resolución es lo que viene después—, y además es este predicado el que
    // frena el caso de un `specific` sin ninguna de las dos listas, que la
    // expansión no podría arreglar porque no hay nada que expandir.
    this.assertAudienceHasTargets(
      body.audience_kind,
      body.user_ids,
      body.business_ids,
    );

    // Los dueños van SUMADOS a los que el operador eligió a mano, no en lugar de
    // ellos: elegir dos negocios y una consumidora tiene que llegarle a los tres.
    const duenos = await this.resolverDuenosDeNegocios(
      body.audience_kind,
      token,
      body.business_ids ?? [],
    );
    const userIds = unionDeUserIds(body.user_ids ?? [], duenos);

    const created = await this.repository.transaction((tx) =>
      this.repository.insert(
        tx,
        AnnouncementMapper.toInsert({ ...body, user_ids: userIds }),
      ),
    );

    return AnnouncementMapper.toDto(created);
  }

  /**
   * Edita un aviso.
   *
   * `token` es el JWT del operador, con el mismo uso que en `create`.
   */
  async update(
    id: string,
    body: UpdateAnnouncementDto,
    token: string | null,
  ): Promise<AnnouncementDto> {
    // Se lee la fila primero: el PATCH es parcial, así que el predicado de
    // audiencia necesita el estado que NO viene en el body. Sin esto, vaciar las
    // listas de un `specific` por PATCH sería la misma fuga silenciosa que en
    // `create`, entrando por la puerta de atrás.
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Announcement ${id} not found`);
    }

    const audienceKind = body.audience_kind ?? existing.audience_kind;
    this.assertAudienceHasTargets(
      audienceKind,
      body.user_ids ?? existing.user_ids,
      body.business_ids ?? existing.business_ids,
    );

    // La audiencia dirigida se resuelve ENTERA si el PATCH habla de ella, y no se
    // toca si el PATCH habla de otra cosa. La parte que no se toca es la que
    // sostiene la partialidad: venir a corregir un título no puede escribir
    // `user_ids`, y escribirlo borraría —o duplicaría— el destinatario de un
    // aviso que alguien puede estar leyendo.
    const tocaAudiencia =
      body.user_ids !== undefined || body.business_ids !== undefined;
    const duenos = tocaAudiencia
      ? await this.resolverDuenosDeNegocios(
          audienceKind,
          token,
          body.business_ids ?? existing.business_ids,
        )
      : [];
    // `user_ids` se escribe cuando el operador lo mencionó O cuando la resolución
    // aportó a alguien. Con la condición más simple —"si el PATCH tocó la
    // audiencia, reescribí la lista"— un PATCH que solo agrega negocios a una
    // audiencia NO dirigida reescribiría una columna que no tocó, y lo haría para
    // guardar exactamente el valor que ya estaba.
    const escribeUserIds = body.user_ids !== undefined || duenos.length > 0;
    // La base del merge es la que el operador eligió en ESTA request —si no, la
    // que ya estaba— y los dueños resueltos se suman a esa. Por eso agregar
    // negocios a un aviso ya publicado no le saca de encima a las consumidoras
    // que ya estaban apuntadas.
    const patch: UpdateAnnouncementDto = escribeUserIds
      ? {
          ...body,
          user_ids: unionDeUserIds(body.user_ids ?? existing.user_ids, duenos),
        }
      : body;

    const updated = await this.repository.transaction(async (tx) => {
      const row = await this.repository.update(
        tx,
        id,
        AnnouncementMapper.toUpdate(patch),
      );
      if (!row) {
        throw new NotFoundException(`Announcement ${id} not found`);
      }
      return row;
    });

    return AnnouncementMapper.toDto(updated);
  }

  /**
   * Da de baja el aviso. Soft delete: `active = false`, sin borrado físico. La
   * fila se queda porque la baja tiene que ser reversible desde el panel.
   */
  async remove(id: string): Promise<void> {
    const deactivated = await this.repository.transaction((tx) =>
      this.repository.deactivate(tx, id),
    );

    if (!deactivated) {
      throw new NotFoundException(`Announcement ${id} not found`);
    }
  }

  /*
   * NO hay acknowledge acá, y su ausencia es una decisión.
   *
   * El acknowledgement de un aviso obligatorio lo escribe el cliente DIRECTO a
   * Supabase, que es la arquitectura del feature: el móvil lee y escribe
   * `announcement_acknowledgements` por PostgREST con su propia sesión, y la
   * policy lo ata al usuario con `with check (user_id = auth.uid())`. Ese
   * invariante —"solo podés acknowledgear por vos"— lo sostiene la base.
   *
   * Una versión por la API lo habría tenido que sostener el código: la
   * conexión de la API es `service_role`, que tiene BYPASSRLS, así que
   * `auth.uid()` no participa y la fila se escribiría con el `sub` de un
   * token que verificó el service. Es la misma garantía en el papel, pero es
   * código y no una restricción — y una superficie de escritura que solo el
   * código protege no es una superficie que valga la pena tener.
   *
   * Además no la usaba nadie: el móvil escribe por la vía directa y el landing
   * es anónimo, así que nunca ve un `required`.
   */

  /**
   * El predicado que cierra el agujero del `specific`. Va textual acá y no en el
   * contrato porque la Task 2 decidió que es regla del service: el SSOT
   * describe la fila, y si esto estuviera en el schema, el panel no podría
   * guardar un borrador de un `specific` a medio pensar.
   *
   * Los tres `?.length ?? 0` son el mismo predicado para las tres formas en que
   * se puede pedir una audiencia: ninguna lista, una lista vacía, o dos vacías.
   */
  private assertAudienceHasTargets(
    audienceKind: string,
    userIds: readonly string[] | undefined,
    businessIds: readonly string[] | undefined,
  ): void {
    if (
      audienceKind === 'specific' &&
      (userIds?.length ?? 0) + (businessIds?.length ?? 0) === 0
    ) {
      throw new BadRequestException(SPECIFIC_WITHOUT_TARGET);
    }
  }

  /**
   * Los `owner_id` de los negocios elegidos, o `[]` cuando no hay nada que
   * resolver.
   *
   * SOLO con `audience_kind = 'specific'`, y esa restricción es el corazón de la
   * decisión. En las otras tres audiencias la policy decide por ROL —`all`,
   * `my_role() = 'user'`, `my_role() = 'business'`— y por lo tanto:
   *
   *  - en `businesses` los dueños ya ven el aviso por rol, así que sumarlos a
   *    `user_ids` no agrega a nadie;
   *  - en `consumers` y en `all` sumarlos LOS AMAGARÍA, porque el predicado de la
   *    policy es un OR: un dueño de negocio metido en `user_ids` vería también un
   *    aviso dirigido a consumidoras. El operador no lo pidió, y ampliar la
   *    audiencia en silencio es el mismo agujero que esta resolución vino a
   *    cerrar, del otro lado.
   *
   * Devuelve una lista de personas, no de negocios: quien la suma a `user_ids` no
   * tiene que saber de dónde salió cada id.
   */
  private async resolverDuenosDeNegocios(
    audienceKind: string,
    token: string | null,
    businessIds: readonly string[],
  ): Promise<string[]> {
    // Sin negocios no hay consulta. Además acá se decide el alcance de la
    // expansión, y una `await` que no se dispara es la mitad de la razón por la
    // que publicar un aviso común no depende de `business_ownership`.
    if (audienceKind !== 'specific' || businessIds.length === 0) {
      return [];
    }

    if (token === null) {
      // La ruta es `@Roles('admin')`: el guard ya verificó un JWT antes de llegar
      // acá. Que la cabecera no haya llegado no es un error del operador, es que
      // se intentó resolver sin identidad — y sin identidad no se puede, porque
      // `anon` no tiene ni grant ni policy sobre `business_ownership` y la
      // lectura saldría vacía, es decir, todos los negocios "sin dueño".
      this.logger.error({
        event: 'announcements_owner_resolve_without_session',
        businessCount: businessIds.length,
      });
      throw new InternalServerErrorException(
        'No se pudieron obtener los dueños de los negocios seleccionados',
      );
    }

    let filas: BusinessOwnershipRow[];
    try {
      filas = await this.repository.ownerIdsForBusinesses(token, businessIds);
    } catch (err) {
      // No se degrada a "el negocio no tiene dueño": esa es una afirmación
      // distinta de "no pudimos preguntar", y hacerla sería un rechazo con un
      // motivo falso, sobre datos que sí están.
      this.logger.error({
        event: 'announcements_owner_resolve_failed',
        businessCount: businessIds.length,
        ...safeErrorFields(err),
      });
      throw new InternalServerErrorException(
        'No se pudieron obtener los dueños de los negocios seleccionados',
      );
    }

    // El negocio sin dueño, rechazado y nombrado. Sin esta comprobación el aviso
    // se publicaría y no llegaría a nadie, sin un solo error en ninguna parte —
    // el peor resultado posible, porque el operador no se entera nunca.
    //
    // La comparación es sobre el `business_id` que volvió, no sobre la cantidad
    // de filas: son cosas distintas y la segunda mintiría. De paso, `flatMap`
    // abajo suma TODOS los dueños de cada negocio —no hay `Map` que se quede con
    // el último— porque la cardinalidad de la relación es de la base y no del
    // código.
    const conDueño = new Set(filas.map((fila) => fila.business_id));
    const sinDueño = [
      ...new Set(businessIds.filter((id) => !conDueño.has(id))),
    ];
    if (sinDueño.length > 0) {
      this.logger.warn({
        event: 'announcements_business_without_owner',
        businessIds: sinDueño,
      });
      throw new BadRequestException(BUSINESS_WITHOUT_OWNER(sinDueño));
    }

    return filas.flatMap((fila) => [fila.owner_id]);
  }
}
