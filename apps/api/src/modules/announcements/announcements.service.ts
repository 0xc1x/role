import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  paginatedDataFromQuery,
  safeErrorFields,
  AnnouncementSchema,
  UuidSchema,
  type AnnouncementDto,
  type AnnouncementListQuery,
  type CreateAnnouncementDto,
  type PaginatedAnnouncements,
  type UpdateAnnouncementDto,
} from '@0xc1x/role-commons';
import { SupabaseTokenVerifier } from '../../auth/supabase-token-verifier';
import {
  AnnouncementsRepository,
  type AnnouncementRow,
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

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private readonly repository: AnnouncementsRepository,
    private readonly tokenVerifier: SupabaseTokenVerifier,
  ) {}

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

  async create(body: CreateAnnouncementDto): Promise<AnnouncementDto> {
    this.assertAudienceHasTargets(
      body.audience_kind,
      body.user_ids,
      body.business_ids,
    );

    const created = await this.repository.transaction((tx) =>
      this.repository.insert(tx, AnnouncementMapper.toInsert(body)),
    );

    return AnnouncementMapper.toDto(created);
  }

  async update(
    id: string,
    body: UpdateAnnouncementDto,
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

    const updated = await this.repository.transaction(async (tx) => {
      const row = await this.repository.update(
        tx,
        id,
        AnnouncementMapper.toUpdate(body),
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

  /**
   * Registra que un usuario entendió un aviso obligatorio.
   *
   * La identidad sale del TOKEN, nunca del body: el acknowledgement es de la
   * fila y por fila, así que aceptar un `user_id` del payload sería dejar que
   * cualquiera marque como entendido el aviso de otro.
   *
   * El token se verifica acá aunque el endpoint sea `@Public`: público quiere
   * decir que no hace falta sesión para *llegar*, no que el que llega pueda
   * escribir sin probar quién es.
   */
  async acknowledge(announcementId: string, token: string): Promise<void> {
    const parsedId = UuidSchema.safeParse(announcementId);
    if (!parsedId.success) {
      throw new BadRequestException('El aviso no tiene un id válido');
    }
    if (!token) {
      // 401 y no 400: al que llega sin token no le falta un campo, le falta
      // demostrar quién es. Y el motivo importa para el cliente: reintentar con
      // el mismo body no lo arregla.
      throw new UnauthorizedException('Hace falta una sesión para acknowledge');
    }

    const { sub } = await this.tokenVerifier.verify(token);

    await this.repository.acknowledge({
      announcement_id: parsedId.data,
      user_id: sub,
    });
  }

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
}
